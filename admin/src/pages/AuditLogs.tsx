import React, { useState, useEffect } from 'react'
import { Search, Filter, Download, AlertTriangle, CheckCircle, XCircle, Clock } from 'lucide-react'
import { getStoredToken } from '../lib/authApi'
import './AuditLogs.css'

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
  const [loading, setLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [filters, setFilters] = useState({
    action: '',
    resourceType: '',
    severity: '',
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
      const token = localStorage.getItem('token')
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '20',
        ...Object.fromEntries(
          Object.entries(filters).filter(([_, value]) => value !== '')
        )
      })

      const response = await fetch(`http://localhost:3001/api/admin/audit-logs?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
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
    } catch (error) {
      console.error('Failed to fetch audit logs:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchStats = async () => {
    try {
      const token = getStoredToken()
      const response = await fetch('http://localhost:3001/api/admin/audit-logs/stats', {
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
      performedBy: '',
      startDate: '',
      endDate: ''
    })
    setCurrentPage(1)
  }

  const exportLogs = () => {
    const csvContent = [
      ['Date', 'Action', 'Resource', 'Description', 'User', 'Status', 'Severity'].join(','),
      ...logs.map(log => [
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  if (loading && currentPage === 1) return <div className="loading">Loading audit logs...</div>

  return (
    <div className="audit-logs-container">
      <div className="header">
        <h1>System Audit Logs</h1>
        <button className="btn-export" onClick={exportLogs}>
          <Download size={20} /> Export CSV
        </button>
      </div>

      {stats && typeof stats.totalLogs !== 'undefined' && (
        <div className="stats-grid">
          <div className="stat-card">
            <h3>Total Logs</h3>
            <p>{stats.totalLogs.toLocaleString()}</p>
          </div>
          <div className="stat-card">
            <h3>Last 30 Days</h3>
            <p>{stats.recentLogs.toLocaleString()}</p>
          </div>
          <div className="stat-card critical">
            <h3>Critical</h3>
            <p>{stats.criticalLogs.toLocaleString()}</p>
          </div>
          <div className="stat-card">
            <h3>New Accounts (Last 30 Days)</h3>
            <p>{stats.newAccounts}</p>
          </div>
        </div>
      )}

      <div className="filters-section">
        <div className="filters-header">
          <h3><Filter size={20} /> Filters</h3>
          <button className="btn-clear" onClick={clearFilters}>Clear All</button>
        </div>
        
        <div className="filters-grid">
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

          <select 
            value={filters.severity} 
            onChange={(e) => handleFilterChange('severity', e.target.value)}
          >
            <option value="">All Severities</option>
            <option value="INFO">Info</option>
            <option value="WARNING">Warning</option>
            <option value="ERROR">Error</option>
            <option value="CRITICAL">Critical</option>
          </select>

          <input
            type="text"
            placeholder="Performed by"
            value={filters.performedBy}
            onChange={(e) => handleFilterChange('performedBy', e.target.value)}
          />

          <input
            type="date"
            placeholder="Start date"
            value={filters.startDate}
            onChange={(e) => handleFilterChange('startDate', e.target.value)}
          />

          <input
            type="date"
            placeholder="End date"
            value={filters.endDate}
            onChange={(e) => handleFilterChange('endDate', e.target.value)}
          />
        </div>
      </div>

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

        {logs.map((log) => (
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
              {log.performedBy.displayName || log.performedBy.username}
              <span className="user-role">({log.performedByRole})</span>
            </div>
            <div className="status-cell">
              {getStatusIcon(log.status)}
              <span>{log.status}</span>
            </div>
            <div className="severity-cell">
              <span 
                className="severity-badge" 
                style={{ backgroundColor: getSeverityColor(log.severity) }}
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

      {logs.length === 0 && !loading && (
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

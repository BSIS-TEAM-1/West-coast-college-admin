import { useState, useEffect } from 'react'
import {
  Users, Search, Filter, Download, Trash2, Eye, Clock, UserCheck,
  CheckCircle, AlertCircle, RefreshCw
} from 'lucide-react'
import { getStoredToken, API_URL, getProfile, type ProfileResponse } from '../lib/authApi'
import './StaffRegistrationLogs.css'

interface RegistrationLog {
  _id: string
  username: string
  displayName: string
  email?: string
  accountType: 'admin' | 'registrar' | 'professor'
  createdAt: string
  status?: 'active' | 'inactive' | 'pending'
}

export default function StaffRegistrationLogs() {
  const [logs, setLogs] = useState<RegistrationLog[]>([])
  const [filteredLogs, setFilteredLogs] = useState<RegistrationLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentUser, setCurrentUser] = useState<ProfileResponse | null>(null)

  // Filters and search
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'admin' | 'registrar' | 'professor'>('all')
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'name'>('newest')

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  // Modal states
  const [selectedLog, setSelectedLog] = useState<RegistrationLog | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  // Load current user
  useEffect(() => {
    getProfile()
      .then(setCurrentUser)
      .catch(() => setCurrentUser(null))
  }, [])

  // Fetch registration logs
  const fetchLogs = async () => {
    setLoading(true)
    try {
      const token = getStoredToken()
      const response = await fetch(`${API_URL}/api/admin/registration-logs`, {
        headers: { Authorization: `Bearer ${token}` }
      })

      if (!response.ok) throw new Error('Failed to fetch logs')

      const data = await response.json()
      setLogs(data.logs || [])
      setError(null)
    } catch (err) {
      console.error('Error fetching logs:', err)
      setError('Failed to load registration logs')
      setLogs([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLogs()
  }, [])

  // Apply filters and sorting
  useEffect(() => {
    let filtered = [...logs]

    // Filter by type
    if (filterType !== 'all') {
      filtered = filtered.filter(log => log.accountType === filterType)
    }

    // Filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter(log =>
        log.username.toLowerCase().includes(term) ||
        log.displayName.toLowerCase().includes(term) ||
        (log.email && log.email.toLowerCase().includes(term))
      )
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'oldest':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        case 'name':
          return a.displayName.localeCompare(b.displayName)
        case 'newest':
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      }
    })

    setFilteredLogs(filtered)
    setCurrentPage(1)
  }, [logs, filterType, searchTerm, sortBy])

  // Delete account
  const handleDelete = async (id: string) => {
    setDeleteLoading(true)
    try {
      const token = getStoredToken()
      const response = await fetch(`${API_URL}/api/admin/accounts/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })

      if (!response.ok) throw new Error('Failed to delete')

      setLogs(logs.filter(log => log._id !== id))
      setDeleteConfirm(null)
    } catch (err) {
      console.error('Error deleting:', err)
    } finally {
      setDeleteLoading(false)
    }
  }

  // Export logs as CSV
  const exportLogs = () => {
    const headers = ['Username', 'Display Name', 'Account Type', 'Created Date', 'Email']
    const rows = filteredLogs.map(log => [
      log.username,
      log.displayName,
      log.accountType.charAt(0).toUpperCase() + log.accountType.slice(1),
      formatDate(log.createdAt),
      log.email || 'N/A'
    ])

    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `staff-registration-logs-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  // Helpers
  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getAccountTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      admin: '#3b82f6',
      registrar: '#10b981',
      professor: '#f59e0b'
    }
    return colors[type] || '#6b7280'
  }

  const getAccountTypeIcon = (type: string) => {
    const iconProps = { size: 16, strokeWidth: 2 }
    switch (type) {
      case 'admin':
        return <UserCheck {...iconProps} />
      case 'registrar':
        return <CheckCircle {...iconProps} />
      case 'professor':
        return <Users {...iconProps} />
      default:
        return <AlertCircle {...iconProps} />
    }
  }

  // Pagination
  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage)
  const startIdx = (currentPage - 1) * itemsPerPage
  const paginatedLogs = filteredLogs.slice(startIdx, startIdx + itemsPerPage)

  const canDelete = currentUser?.accountType === 'admin'

  return (
    <div className="staff-registration-logs">
      <div className="logs-header">
        <div className="header-content">
          <div className="header-title">
            <Users size={24} />
            <div>
              <h1>Staff Registration Logs</h1>
              <p>Manage and monitor staff account registrations</p>
            </div>
          </div>
          <div className="header-actions">
            <button className="btn btn-secondary" onClick={fetchLogs} title="Refresh">
              <RefreshCw size={18} />
            </button>
            <button className="btn btn-secondary" onClick={exportLogs} disabled={filteredLogs.length === 0}>
              <Download size={18} />
              <span>Export</span>
            </button>
          </div>
        </div>
      </div>

      <div className="logs-container">
        {/* Search and Filter Bar */}
        <div className="search-filter-bar">
          <div className="search-box">
            <Search size={18} />
            <input
              type="text"
              placeholder="Search by name, username, or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="filter-controls">
            <div className="filter-group">
              <Filter size={16} />
              <select value={filterType} onChange={(e) => setFilterType(e.target.value as any)}>
                <option value="all">All Types</option>
                <option value="admin">Admin</option>
                <option value="registrar">Registrar</option>
                <option value="professor">Professor</option>
              </select>
            </div>

            <div className="filter-group">
              <Clock size={16} />
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="name">By Name</option>
              </select>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="stats-row">
          <div className="stat-box">
            <div className="stat-label">Total Records</div>
            <div className="stat-value">{filteredLogs.length}</div>
          </div>
          <div className="stat-box">
            <div className="stat-label">Admins</div>
            <div className="stat-value">{logs.filter(l => l.accountType === 'admin').length}</div>
          </div>
          <div className="stat-box">
            <div className="stat-label">Registrars</div>
            <div className="stat-value">{logs.filter(l => l.accountType === 'registrar').length}</div>
          </div>
          <div className="stat-box">
            <div className="stat-label">Professors</div>
            <div className="stat-value">{logs.filter(l => l.accountType === 'professor').length}</div>
          </div>
        </div>

        {/* Table */}
        <div className="logs-table">
          {loading ? (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>Loading registration logs...</p>
            </div>
          ) : error ? (
            <div className="error-state">
              <AlertCircle size={32} />
              <p>{error}</p>
              <button className="btn btn-primary" onClick={fetchLogs}>
                Try Again
              </button>
            </div>
          ) : paginatedLogs.length === 0 ? (
            <div className="empty-state">
              <Users size={40} />
              <p>No registration logs found</p>
              <span>Try adjusting your filters</span>
            </div>
          ) : (
            <>
              <div className="table-header">
                <div className="col-checkbox"></div>
                <div className="col-user">User</div>
                <div className="col-type">Type</div>
                <div className="col-date">Registered</div>
                <div className="col-actions">Actions</div>
              </div>

              <div className="table-body">
                {paginatedLogs.map((log) => (
                  <div key={log._id} className="table-row">
                    <div className="col-checkbox">
                      <input type="checkbox" disabled />
                    </div>

                    <div className="col-user">
                      <div className="user-avatar" style={{ background: `${getAccountTypeColor(log.accountType)}20`, color: getAccountTypeColor(log.accountType) }}>
                        {getAccountTypeIcon(log.accountType)}
                      </div>
                      <div className="user-info">
                        <div className="user-name">{log.displayName}</div>
                        <div className="user-email">{log.username}</div>
                      </div>
                    </div>

                    <div className="col-type">
                      <span className={`badge badge-${log.accountType}`}>
                        {log.accountType.charAt(0).toUpperCase() + log.accountType.slice(1)}
                      </span>
                    </div>

                    <div className="col-date">
                      <div className="date-value">{formatDate(log.createdAt)}</div>
                    </div>

                    <div className="col-actions">
                      <button
                        className="action-btn view-btn"
                        onClick={() => setSelectedLog(log)}
                        title="View details"
                      >
                        <Eye size={16} />
                      </button>
                      {canDelete && (
                        <button
                          className="action-btn delete-btn"
                          onClick={() => setDeleteConfirm(log._id)}
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="pagination">
            <button
              className="pagination-btn"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              ← Previous
            </button>

            <div className="pagination-info">
              Page {currentPage} of {totalPages}
            </div>

            <button
              className="pagination-btn"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              Next →
            </button>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedLog && (
        <div className="modal-overlay" onClick={() => setSelectedLog(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Staff Details</h2>
              <button className="modal-close" onClick={() => setSelectedLog(null)}>×</button>
            </div>

            <div className="modal-content">
              <div className="detail-grid">
                <div className="detail-item">
                  <label>Username</label>
                  <p>{selectedLog.username}</p>
                </div>
                <div className="detail-item">
                  <label>Display Name</label>
                  <p>{selectedLog.displayName}</p>
                </div>
                <div className="detail-item">
                  <label>Account Type</label>
                  <p>
                    <span className={`badge badge-${selectedLog.accountType}`}>
                      {selectedLog.accountType.charAt(0).toUpperCase() + selectedLog.accountType.slice(1)}
                    </span>
                  </p>
                </div>
                <div className="detail-item">
                  <label>Registered</label>
                  <p>{formatDate(selectedLog.createdAt)}</p>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setSelectedLog(null)}>Close</button>
              {canDelete && (
                <button
                  className="btn btn-danger"
                  onClick={() => {
                    setDeleteConfirm(selectedLog._id)
                    setSelectedLog(null)
                  }}
                >
                  Delete Account
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header danger">
              <AlertCircle size={24} />
              <h2>Delete Account</h2>
            </div>

            <div className="modal-content">
              <p>Are you sure you want to delete this staff account? This action cannot be undone.</p>
            </div>

            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setDeleteConfirm(null)}
                disabled={deleteLoading}
              >
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={() => handleDelete(deleteConfirm)}
                disabled={deleteLoading}
              >
                {deleteLoading ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

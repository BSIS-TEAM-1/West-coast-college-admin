import { useMemo, useState, useEffect } from 'react'
import {
  Users, Search, Filter, Download, Trash2, Eye, Clock, UserCheck,
  CheckCircle, AlertCircle, RefreshCw, X, Calendar
} from 'lucide-react'
import { getStoredToken, API_URL, getProfile, type ProfileResponse } from '../lib/authApi'
import './StaffRegistrationLogs.css'

interface RegistrationLog {
  _id: string
  username: string
  displayName: string
  email?: string
  uid?: string
  createdBy?: string | { username?: string; displayName?: string; uid?: string }
  accountType: 'admin' | 'registrar' | 'professor'
  createdAt: string
  status?: 'active' | 'inactive' | 'pending'
}

const ITEMS_PER_PAGE = 10

export default function StaffRegistrationLogs() {
  const [logs, setLogs] = useState<RegistrationLog[]>([])
  const [filteredLogs, setFilteredLogs] = useState<RegistrationLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentUser, setCurrentUser] = useState<ProfileResponse | null>(null)

  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'admin' | 'registrar' | 'professor'>('all')
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'name'>('newest')

  const [currentPage, setCurrentPage] = useState(1)

  const [selectedLog, setSelectedLog] = useState<RegistrationLog | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  useEffect(() => {
    getProfile()
      .then(setCurrentUser)
      .catch(() => setCurrentUser(null))
  }, [])

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

  useEffect(() => {
    let filtered = [...logs]

    if (filterType !== 'all') {
      filtered = filtered.filter((log) => log.accountType === filterType)
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter((log) =>
        log.username.toLowerCase().includes(term) ||
        log.displayName.toLowerCase().includes(term) ||
        (log.email && log.email.toLowerCase().includes(term))
      )
    }

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

  const handleDelete = async (id: string) => {
    setDeleteLoading(true)
    try {
      const token = getStoredToken()
      const response = await fetch(`${API_URL}/api/admin/accounts/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })

      if (!response.ok) throw new Error('Failed to delete')

      setLogs((prev) => prev.filter((log) => log._id !== id))
      setDeleteConfirm(null)
    } catch (err) {
      console.error('Error deleting:', err)
    } finally {
      setDeleteLoading(false)
    }
  }

  const exportLogs = () => {
    const headers = ['Username', 'Display Name', 'UID', 'Account Type', 'Created Date', 'Created By', 'Email']
    const rows = filteredLogs.map((log) => [
      log.username,
      log.displayName,
      getUidDisplay(log),
      log.accountType.charAt(0).toUpperCase() + log.accountType.slice(1),
      formatDate(log.createdAt),
      getCreatedByDisplay(log),
      log.email || 'N/A'
    ])

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell}"`).join(','))
      .join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `staff-registration-logs-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  const clearFilters = () => {
    setSearchTerm('')
    setFilterType('all')
    setSortBy('newest')
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getUidDisplay = (log: RegistrationLog) => {
    if (log.uid) return log.uid
    if (log._id) return log._id.slice(-12).toUpperCase()
    return 'N/A'
  }

  const getCreatedByDisplay = (log: RegistrationLog) => {
    const createdBy = log.createdBy
    if (!createdBy) return 'System'
    if (typeof createdBy === 'string') return createdBy
    return createdBy.displayName || createdBy.username || createdBy.uid || 'System'
  }

  const getAccountTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      admin: '#3b82f6',
      registrar: '#a855f7',
      professor: '#10b981'
    }
    return colors[type] || '#64748b'
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

  const totalPages = Math.ceil(filteredLogs.length / ITEMS_PER_PAGE)
  const startIdx = (currentPage - 1) * ITEMS_PER_PAGE
  const paginatedLogs = filteredLogs.slice(startIdx, startIdx + ITEMS_PER_PAGE)

  const canDelete = currentUser?.accountType === 'admin'
  const hasActiveFilters = Boolean(searchTerm) || filterType !== 'all' || sortBy !== 'newest'

  return (
    <div className="staff-registration-logs">
      <div className="logs-header">
        <div className="header-title">
          <Users size={28} />
          <div>
            <h1>Staff Registration Logs</h1>
            <p>View and manage staff creation history</p>
          </div>
        </div>
      </div>

      <div className="toolbar-row">
        <div className="search-box">
          <Search size={18} />
          <input
            type="text"
            placeholder="Search by username, display name, or UID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="toolbar-card">
          <div className="toolbar-field">
            <label>Account Type:</label>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value as 'all' | 'admin' | 'registrar' | 'professor')}>
              <option value="all">All Types</option>
              <option value="admin">Admin</option>
              <option value="registrar">Registrar</option>
              <option value="professor">Professor</option>
            </select>
          </div>

          <div className="toolbar-actions">
            <button className="btn btn-ghost" onClick={fetchLogs} title="Refresh logs" aria-label="Refresh logs">
              <RefreshCw size={16} />
            </button>
            <button className="btn btn-primary" onClick={exportLogs} disabled={filteredLogs.length === 0}>
              <Download size={16} />
              <span>Export</span>
            </button>
          </div>
        </div>
      </div>

      {hasActiveFilters && (
        <div className="filters-row">
          <div className="sort-wrap">
            <Clock size={14} />
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as 'newest' | 'oldest' | 'name')}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="name">Name (A-Z)</option>
            </select>
          </div>
          <button className="btn btn-link" onClick={clearFilters} type="button">
            <X size={14} />
            Clear filters
          </button>
        </div>
      )}

      <div className="logs-table-card">
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
              <span>Try adjusting your filters or refreshing.</span>
              {hasActiveFilters && (
                <button className="btn btn-link" onClick={clearFilters} type="button">
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="table-header">
                <div className="col-account">Account Details</div>
                <div className="col-uid">UID</div>
                <div className="col-type">Account Type</div>
                <div className="col-created">Created</div>
                <div className="col-created-by">Created By</div>
                <div className="col-actions">Actions</div>
              </div>

              <div className="table-body">
                {paginatedLogs.map((log) => (
                  <div key={log._id} className="table-row">
                    <div className="col-account" data-label="Account Details">
                      <div className="user-name">{log.displayName}</div>
                      <div className="user-email">@{log.username}</div>
                    </div>

                    <div className="col-uid" data-label="UID">
                      <span className="uid-chip">{getUidDisplay(log)}</span>
                    </div>

                    <div className="col-type" data-label="Account Type">
                      <span className={`badge badge-${log.accountType}`}>
                        {getAccountTypeIcon(log.accountType)}
                        {log.accountType.charAt(0).toUpperCase() + log.accountType.slice(1)}
                      </span>
                    </div>

                    <div className="col-created" data-label="Created">
                      <span className="created-time"><Calendar size={14} /> {formatDate(log.createdAt)}</span>
                    </div>

                    <div className="col-created-by" data-label="Created By">
                      {getCreatedByDisplay(log)}
                    </div>

                    <div className="col-actions" data-label="Actions">
                      <button
                        className="action-btn view-btn"
                        onClick={() => setSelectedLog(log)}
                        title="View details"
                        aria-label="View details"
                      >
                        <Eye size={14} />
                      </button>
                      {canDelete && (
                        <button
                          className="action-btn delete-btn"
                          onClick={() => setDeleteConfirm(log._id)}
                          title="Delete account"
                          aria-label="Delete account"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {totalPages > 1 && (
          <div className="pagination">
            <button
              className="pagination-btn"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              {'<'} Previous
            </button>
            <div className="pagination-info">Page {currentPage} of {totalPages}</div>
            <button
              className="pagination-btn"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              Next {'>'}
            </button>
          </div>
        )}
      </div>

      {selectedLog && (
        <div className="modal-overlay" onClick={() => setSelectedLog(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Staff Details</h2>
              <button className="modal-close" onClick={() => setSelectedLog(null)} aria-label="Close details modal">
                <X size={18} />
              </button>
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
                  <label>UID</label>
                  <p>{getUidDisplay(selectedLog)}</p>
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
                <div className="detail-item">
                  <label>Created By</label>
                  <p>{getCreatedByDisplay(selectedLog)}</p>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-link" onClick={() => setSelectedLog(null)}>Close</button>
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

      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header danger">
              <AlertCircle size={22} />
              <h2>Delete Account</h2>
            </div>

            <div className="modal-content">
              <p>Are you sure you want to delete this staff account? This action cannot be undone.</p>
            </div>

            <div className="modal-footer">
              <button
                className="btn btn-link"
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

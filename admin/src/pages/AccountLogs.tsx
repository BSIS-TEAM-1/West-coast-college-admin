import { useState, useEffect } from 'react';
import { Users, Calendar, Search, Download, Eye, Trash2 } from 'lucide-react';
import { getAccountLogs, deleteAccount, getProfile } from '../lib/authApi';
import type { AccountLog, ProfileResponse } from '../lib/authApi';
import './AccountLogs.css';

export default function AccountLogs() {
  const [logs, setLogs] = useState<AccountLog[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<AccountLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'admin' | 'registrar' | 'professor'>('all');
    const [selectedLog, setSelectedLog] = useState<AccountLog | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<AccountLog | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<ProfileResponse | null>(null);

  // Load current user profile
  useEffect(() => {
    getProfile()
      .then(setCurrentUser)
      .catch(() => setCurrentUser(null));
  }, []);

  useEffect(() => {
    const loadLogs = async () => {
      try {
        const data = await getAccountLogs();
        setLogs(data);
        setFilteredLogs(data);
        setError(null);
      } catch (error) {
        console.error('Failed to load logs:', error);
        setError('Failed to load account logs. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    loadLogs();
  }, []);

  useEffect(() => {
    let filtered = logs;

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(log =>
        log.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.uid.includes(searchTerm)
      );
    }

    // Filter by account type
    if (filterType !== 'all') {
      filtered = filtered.filter(log => log.accountType === filterType);
    }

    
    setFilteredLogs(filtered);
  }, [logs, searchTerm, filterType]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  
  const getAccountTypeColor = (type: string) => {
    switch (type) {
      case 'admin':
        return '#2563eb';
      case 'registrar':
        return '#7c3aed';
      case 'professor':
        return '#059669';
      default:
        return '#6b7280';
    }
  };

  const handleExport = () => {
    // TODO: Implement export functionality
    console.log('Exporting logs...');
  };

  const handleDelete = async (account: AccountLog) => {
    setDeleteLoading(true);
    try {
      await deleteAccount(account._id);
      // Remove from local state
      setLogs(prev => prev.filter(log => log._id !== account._id));
      setFilteredLogs(prev => prev.filter(log => log._id !== account._id));
      setDeleteConfirm(null);
    } catch (err) {
      console.error('Failed to delete account:', err);
      alert(err instanceof Error ? err.message : 'Failed to delete account');
    } finally {
      setDeleteLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="account-logs-page">
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <p>Loading account logs...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="account-logs-page">
        <header>
          <h1 className="logs-title">Staff Registration Logs</h1>
          <p className="logs-desc">View and manage account creation history</p>
        </header>
        <div className="error-state">
          <div className="error-message">
            <p>{error}</p>
            <button onClick={() => window.location.reload()} className="retry-btn">
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="account-logs-page">
      <header>
        <h1 className="logs-title">Staff Registration Logs</h1>
        <p className="logs-desc">View and manage staff creation history</p>
      </header>

      {/* Filters and Search */}
      <div className="logs-controls">
        <div className="search-section">
          <div className="search-box">
            <Search size={18} className="search-icon" />
            <input
              type="text"
              placeholder="Search by username, display name, or UID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>
        </div>

        <div className="filters-section">
          <div className="filter-group">
            <label className="filter-label">Account Type:</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              className="filter-select"
            >
              <option value="all">All Types</option>
              <option value="admin">Admin</option>
              <option value="registrar">Registrar</option>
              <option value="professor">Professor</option>
            </select>
          </div>

          
          <button className="export-btn" onClick={handleExport}>
            <Download size={16} />
            Export
          </button>
        </div>
      </div>

      {/* Logs Table */}
      <div className="logs-table-container">
        <table className="logs-table">
          <thead>
            <tr>
              <th>Account Details</th>
              <th>UID</th>
              <th>Account Type</th>
              <th>Created</th>
              <th>Created By</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={6} className="no-results">
                  <div className="no-results-content">
                    <Users size={48} />
                    <p>No logs found matching your criteria</p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredLogs.map((log) => (
                <tr key={log._id} className="log-row">
                  <td className="account-details">
                    <div className="account-info">
                      <div className="account-name">{log.displayName}</div>
                      <div className="account-username">@{log.username}</div>
                    </div>
                  </td>
                  <td className="uid-cell">
                    <code className="uid-code">{log.uid}</code>
                  </td>
                  <td className="type-cell">
                    <span
                      className="type-badge"
                      style={{ backgroundColor: getAccountTypeColor(log.accountType) }}
                    >
                      {log.accountType.charAt(0).toUpperCase() + log.accountType.slice(1)}
                    </span>
                  </td>
                  <td className="date-cell">
                    <div className="date-info">
                      <Calendar size={14} />
                      <span>{formatDate(log.createdAt)}</span>
                    </div>
                  </td>
                  <td className="creator-cell">{log.createdBy}</td>
                  <td className="actions-cell">
                    <button
                      className="action-btn"
                      onClick={() => setSelectedLog(log)}
                      title="View details"
                    >
                      <Eye size={16} />
                    </button>
                    {/* Show delete button if:
                        1. Not your own account
                        2. Either you're super admin (can delete anyone) OR target is not an admin (registrar) */}
                    {currentUser?.username !== log.username && 
                     (currentUser?.accountType !== 'admin' || log.accountType !== 'admin') && (
                      <button
                        className="action-btn delete-btn"
                        onClick={() => setDeleteConfirm(log)}
                        title="Delete account"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Detail Modal */}
      {selectedLog && (
        <div className="modal-overlay" onClick={() => setSelectedLog(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Account Details</h3>
              <button
                className="close-btn"
                onClick={() => setSelectedLog(null)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="detail-grid">
                <div className="detail-item">
                  <label>Display Name:</label>
                  <span>{selectedLog.displayName}</span>
                </div>
                <div className="detail-item">
                  <label>Username:</label>
                  <span>@{selectedLog.username}</span>
                </div>
                <div className="detail-item">
                  <label>UID:</label>
                  <code>{selectedLog.uid}</code>
                </div>
                <div className="detail-item">
                  <label>Account Type:</label>
                  <span>{selectedLog.accountType}</span>
                </div>
                <div className="detail-item">
                  <label>Status:</label>
                  <span>{selectedLog.status}</span>
                </div>
                <div className="detail-item">
                  <label>Created At:</label>
                  <span>{formatDate(selectedLog.createdAt)}</span>
                </div>
                <div className="detail-item">
                  <label>Created By:</label>
                  <span>{selectedLog.createdBy}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => !deleteLoading && setDeleteConfirm(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ color: '#dc2626' }}>Delete Account</h3>
              <button
                className="close-btn"
                onClick={() => !deleteLoading && setDeleteConfirm(null)}
                disabled={deleteLoading}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: '1rem' }}>
                Are you sure you want to delete the account <strong>@{deleteConfirm.username}</strong>?
              </p>
              <p style={{ color: '#6b7280', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                This action cannot be undone. The account for <strong>{deleteConfirm.displayName}</strong> will be permanently removed.
              </p>
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                <button
                  className="action-btn"
                  onClick={() => setDeleteConfirm(null)}
                  disabled={deleteLoading}
                  style={{ padding: '0.5rem 1rem' }}
                >
                  Cancel
                </button>
                <button
                  className="action-btn delete-btn"
                  onClick={() => handleDelete(deleteConfirm)}
                  disabled={deleteLoading}
                  style={{ 
                    padding: '0.5rem 1rem', 
                    backgroundColor: '#dc2626', 
                    color: 'white',
                    opacity: deleteLoading ? 0.7 : 1
                  }}
                >
                  {deleteLoading ? 'Deleting...' : 'Delete Account'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

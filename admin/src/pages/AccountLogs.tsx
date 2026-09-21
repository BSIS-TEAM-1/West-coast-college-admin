import { useState, useEffect, useRef, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { Users, Calendar, Search, Download, Eye, EyeOff, Trash2, MoreVertical, Shield } from 'lucide-react';
import { getAccountLogs, deleteAccount, getProfile, changeStaffPassword } from '../lib/authApi';
import type { AccountLog, ProfileResponse } from '../lib/authApi';
import './AccountLogs.css';

const STAFF_PASSWORD_MIN_LENGTH = 8;
const STAFF_PASSWORD_MAX_LENGTH = 128;

function ActionDropdown({
  onView,
  onDelete,
  canDelete,
}: {
  onView: () => void
  onDelete: () => void
  canDelete: boolean
}) {
  const [open, setOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const toggle = () => {
    if (!open && ref.current) {
      const rect = ref.current.getBoundingClientRect()
      const menuHeight = 120
      const spaceBelow = window.innerHeight - rect.bottom
      const top = spaceBelow < menuHeight ? rect.top - menuHeight - 4 : rect.bottom + 4
      const left = rect.right - 140
      setMenuPos({ top, left })
    }
    setOpen(!open)
  }

  const handle = (fn: () => void) => {
    setOpen(false)
    fn()
  }

  return (
    <div className="action-dropdown" ref={ref}>
      <button
        className="action-trigger"
        onClick={toggle}
        title="Actions"
      >
        <MoreVertical size={16} />
      </button>
      {open && menuPos && (
        <div className="action-menu" role="menu" style={{ position: 'fixed', top: menuPos.top, left: menuPos.left }}>
          <button role="menuitem" onClick={() => handle(onView)}>
            <Eye size={15} /> View Details
          </button>
          {canDelete && (
            <button role="menuitem" className="action-menu--delete" onClick={() => handle(onDelete)}>
              <Trash2 size={15} /> Delete
            </button>
          )}
        </div>
      )}
    </div>
  )
}

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
  const [avatarError, setAvatarError] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordFormError, setPasswordFormError] = useState<string | null>(null);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const toastTimerRef = useRef<number | null>(null);

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

  const filteredTypeCounts: Record<'admin' | 'registrar' | 'professor', number> = filteredLogs.reduce(
    (totals, log) => {
      totals[log.accountType] += 1;
      return totals;
    },
    { admin: 0, registrar: 0, professor: 0 }
  );

  const summaryCards = [
    { label: 'Total Staff', value: logs.length.toString() },
    { label: 'Admins', value: filteredTypeCounts.admin.toString() },
    { label: 'Registrars', value: filteredTypeCounts.registrar.toString() },
    { label: 'Professors', value: filteredTypeCounts.professor.toString() }
  ];

  const handleExport = () => {
    // TODO: Implement export functionality
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

  const handleAvatarError = () => {
    setAvatarError(true);
  };

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 4000);
  };

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const resetPasswordForm = () => {
    setNewPassword('');
    setConfirmPassword('');
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    setPasswordFormError(null);
    setPasswordLoading(false);
  };

  const closeChangePasswordModal = () => {
    if (passwordLoading) return;
    setChangePasswordOpen(false);
    resetPasswordForm();
  };

  const closeAccountDetails = () => {
    setSelectedLog(null);
    setChangePasswordOpen(false);
    resetPasswordForm();
  };

  const getPasswordValidationError = () => {
    if (!newPassword) {
      return 'New password is required.';
    }
    if (!confirmPassword) {
      return 'Confirm password is required.';
    }
    if (newPassword.length < STAFF_PASSWORD_MIN_LENGTH || newPassword.length > STAFF_PASSWORD_MAX_LENGTH) {
      return `Password must be between ${STAFF_PASSWORD_MIN_LENGTH} and ${STAFF_PASSWORD_MAX_LENGTH} characters.`;
    }
    if (newPassword !== confirmPassword) {
      return 'Passwords do not match.';
    }
    return null;
  };

  const handleChangePassword = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedLog || passwordLoading) return;

    const validationError = getPasswordValidationError();
    if (validationError) {
      setPasswordFormError(validationError);
      return;
    }

    setPasswordFormError(null);
    setPasswordLoading(true);
    try {
      const result = await changeStaffPassword(selectedLog._id, newPassword, confirmPassword);
      showToast('success', result.message || 'Staff password updated successfully.');
      setChangePasswordOpen(false);
      resetPasswordForm();
    } catch (err) {
      setPasswordFormError(err instanceof Error ? err.message : 'Failed to update staff password.');
    } finally {
      setPasswordLoading(false);
    }
  };

  // Reset avatar error when changing selected log
  useEffect(() => {
    if (selectedLog) {
      setAvatarError(false);
    } else {
      setChangePasswordOpen(false);
      resetPasswordForm();
    }
  }, [selectedLog]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (selectedLog || deleteConfirm) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [selectedLog, deleteConfirm]);

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
      <header className="logs-hero">
        <div className="logs-hero-copy">
          <h1 className="logs-title">Staff Registration Logs</h1>
          <p className="logs-desc">View and manage staff creation history</p>
        </div>
        <div className="logs-hero-kpis" aria-label="Registration log summary">
          {summaryCards.map((card) => (
            <div key={card.label} className="logs-kpi-card">
              <span className="logs-kpi-value">{card.value}</span>
              <span className="logs-kpi-label">{card.label}</span>
            </div>
          ))}
        </div>
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
        <div className="logs-table-meta">
          <span className="logs-table-count">
            Showing {filteredLogs.length} of {logs.length} accounts
          </span>
          {(searchTerm || filterType !== 'all') && (
            <span className="logs-table-filter-chip">
              {filterType !== 'all' ? `Type: ${filterType}` : 'All types'}
              {searchTerm ? ` | Search: ${searchTerm}` : ''}
            </span>
          )}
        </div>
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
                      {log.accountType.toUpperCase()}
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
                    <ActionDropdown
                      onView={() => setSelectedLog(log)}
                      onDelete={() => setDeleteConfirm(log)}
                      canDelete={currentUser?.username !== log.username && 
                               (currentUser?.accountType !== 'admin' || log.accountType !== 'admin')}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Detail Modal */}
      {selectedLog && createPortal(
        <div className="modal-overlay" onClick={closeAccountDetails}>
          <div className="modal-content account-details-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Account Details</h3>
              <div className="modal-header-right">
                <span className="account-type-badge">{selectedLog.accountType.toUpperCase()}</span>
                <button
                  className="close-btn"
                  onClick={closeAccountDetails}
                >
                  ×
                </button>
              </div>
            </div>
            <div className="modal-body">
              {/* Staff Profile Section */}
              <div className="staff-profile-section">
                <div className="staff-avatar">
                  {selectedLog.avatar && !avatarError ? (
                    <img 
                      src={selectedLog.avatar} 
                      alt={selectedLog.displayName} 
                      onError={handleAvatarError}
                    />
                  ) : (
                    <div className="avatar-initials">
                      {selectedLog.displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                    </div>
                  )}
                </div>
                <div className="staff-info">
                  <div className="staff-name">{selectedLog.displayName}</div>
                  <div className="staff-username">@{selectedLog.username}</div>
                  <div className="staff-status-row">
                    <span className={`status-badge status-${selectedLog.status?.toLowerCase() || 'active'}`}>
                      {selectedLog.status || 'Active'}
                    </span>
                    <span className="account-type-text">{selectedLog.accountType.toUpperCase()} account</span>
                  </div>
                </div>
              </div>

              {/* Account Information Section */}
              <div className="account-info-section">
                <div className="section-title">ACCOUNT INFORMATION</div>
                <div className="info-grid">
                  <div className="info-row">
                    <span className="info-label">User ID</span>
                    <span className="info-value">{selectedLog.uid}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Created by</span>
                    <span className="info-value">{selectedLog.createdBy}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Created at</span>
                    <span className="info-value">{formatDate(selectedLog.createdAt)}</span>
                  </div>
                </div>
              </div>

              <div className="account-security-section">
                <div className="section-title">SECURITY</div>
                <div className="security-card">
                  <div className="security-card-copy">
                    <div className="security-icon" aria-hidden="true">
                      <Shield size={20} />
                    </div>
                    <div>
                      <div className="security-title">Change Password</div>
                      <p className="security-description">Update this staff member's login password.</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="modal-primary-btn"
                    onClick={() => {
                      resetPasswordForm();
                      setChangePasswordOpen(true);
                    }}
                  >
                    Change Password
                  </button>
                </div>
              </div>

              {/* Account Status */}
              <div className="account-status-section">
                <span className="status-label">Account status</span>
                <span className={`status-badge status-${selectedLog.status?.toLowerCase() || 'active'}`}>
                  {selectedLog.status || 'Active'}
                </span>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {selectedLog && changePasswordOpen && createPortal(
        <div className="modal-overlay change-password-overlay" onClick={closeChangePasswordModal}>
          <div
            className="modal-content change-password-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="change-staff-password-title"
            aria-modal="true"
          >
            <div className="modal-header">
              <h3 id="change-staff-password-title">Change Staff Password</h3>
              <button
                className="close-btn"
                onClick={closeChangePasswordModal}
                disabled={passwordLoading}
              >
                ×
              </button>
            </div>
            <form className="modal-body" onSubmit={handleChangePassword}>
              <div className="staff-profile-section change-password-staff">
                <div className="staff-avatar">
                  {selectedLog.avatar && !avatarError ? (
                    <img
                      src={selectedLog.avatar}
                      alt={selectedLog.displayName}
                      onError={handleAvatarError}
                    />
                  ) : (
                    <div className="avatar-initials">
                      {selectedLog.displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                    </div>
                  )}
                </div>
                <div className="staff-info">
                  <div className="staff-name">{selectedLog.displayName}</div>
                  <div className="staff-username">@{selectedLog.username}</div>
                </div>
              </div>

              <div className="password-field">
                <label htmlFor="staff-new-password">New Password</label>
                <div className="password-input-wrap">
                  <input
                    id="staff-new-password"
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => {
                      setNewPassword(e.target.value);
                      setPasswordFormError(null);
                    }}
                    autoComplete="new-password"
                    disabled={passwordLoading}
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowNewPassword((prev) => !prev)}
                    aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showNewPassword}
                    disabled={passwordLoading}
                  >
                    {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <ul className="password-requirements" aria-live="polite">
                  <li className={newPassword.length >= STAFF_PASSWORD_MIN_LENGTH && newPassword.length <= STAFF_PASSWORD_MAX_LENGTH ? 'is-met' : ''}>
                    {STAFF_PASSWORD_MIN_LENGTH}–{STAFF_PASSWORD_MAX_LENGTH} characters
                  </li>
                  <li className={newPassword && confirmPassword && newPassword === confirmPassword ? 'is-met' : ''}>
                    Passwords must match
                  </li>
                </ul>
              </div>

              <div className="password-field">
                <label htmlFor="staff-confirm-password">Confirm New Password</label>
                <div className="password-input-wrap">
                  <input
                    id="staff-confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      setPasswordFormError(null);
                    }}
                    autoComplete="new-password"
                    disabled={passwordLoading}
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showConfirmPassword}
                    disabled={passwordLoading}
                  >
                    {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {passwordFormError && (
                <p className="password-form-error" role="alert">{passwordFormError}</p>
              )}

              <div className="change-password-actions">
                <button
                  type="button"
                  className="modal-secondary-btn"
                  onClick={closeChangePasswordModal}
                  disabled={passwordLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="modal-primary-btn"
                  disabled={passwordLoading}
                >
                  {passwordLoading ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {toast && createPortal(
        <div className={`logs-toast ${toast.type}`} role="status" aria-live="polite">
          {toast.message}
        </div>,
        document.body
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && createPortal(
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
        </div>,
        document.body
      )}
    </div>
  );
}

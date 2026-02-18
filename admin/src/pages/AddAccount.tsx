import React, { useState, useEffect } from 'react';
import { Shield, BookOpen, Crown } from 'lucide-react';
import { getProfile, createAccount, getAccountCount } from '../lib/authApi';
import type { ProfileResponse } from '../lib/authApi';
import './AddAccount.css';

type AccountType = 'admin' | 'registrar' | 'professor';

interface AccountFormData {
  username: string;
  displayName: string;
  accountType: AccountType;
  password: string;
  confirmPassword: string;
  uid: string;
}

const accountTypes = [
  {
    type: 'admin',
    label: 'Administrator',
    icon: Shield,
    description: 'Full system access and user management',
    permissions: ['Manage all accounts', 'System configuration', 'Full access to all features']
  },
  {
    type: 'registrar',
    label: 'Registrar',
    icon: BookOpen,
    description: 'Handle student records and registration',
    permissions: ['Manage student records', 'Process registrations', 'Generate reports']
  },
  {
    type: 'professor',
    label: 'Professor',
    icon: Crown,
    description: 'Academic faculty with teaching privileges',
    permissions: ['Manage courses', 'Grade students', 'View academic records']
  }
];

// Function to generate UID based on account type and specified format
const generateUID = (accountType: AccountType, accountCount: number): string => {
  const currentYear = new Date().getFullYear();
  const now = new Date();
  const militaryTime = now.toTimeString().slice(0, 5).replace(':', ''); // HHMM format
  
  switch (accountType) {
    case 'professor':
      // Professor format: 1YYYYXXXHHMM (starts with 1 for professor, begins at 3000)
      const paddedProfessorCount = (accountCount + 3000).toString().padStart(4, '0');
      return `1${currentYear}${paddedProfessorCount}${militaryTime}`;
    
    case 'admin':
      // Admin format: 1YYYYXXXHHMM (starts with 1 for admin, begins at 6000)
      const paddedAdminCount = (accountCount + 6000).toString().padStart(4, '0');
      return `1${currentYear}${paddedAdminCount}${militaryTime}`;
    
    case 'registrar':
      // Registrar format: 1YYYYXXXHHMM (starts with 1 for registrar, begins at 9000)
      const paddedRegistrarCount = (accountCount + 9000).toString().padStart(4, '0');
      return `1${currentYear}${paddedRegistrarCount}${militaryTime}`;
    
    default:
      // Fallback format
      const paddedDefaultCount = accountCount.toString().padStart(3, '0');
      return `${currentYear}${paddedDefaultCount}${militaryTime}`;
  }
};

// Function to get current account count for specific account type from API
const getCurrentAccountCount = async (accountType: AccountType): Promise<number> => {
  try {
    return await getAccountCount(accountType);
  } catch (error) {
    console.error('Failed to get account count:', error);
    // Fallback to default values
    switch (accountType) {
      case 'registrar':
        return 1;
      case 'admin':
        return 1;
      case 'professor':
        return 1;
      default:
        return 1;
    }
  }
};

export default function AddAccount() {
  const [formData, setFormData] = useState<AccountFormData>({
    username: '',
    displayName: '',
    accountType: 'admin',
    password: '',
    confirmPassword: '',
    uid: ''
  });
  const [selectedType, setSelectedType] = useState<AccountType>('admin');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'error' | 'success'; message: string } | null>(null);
  const [accountCount, setAccountCount] = useState<number>(0);
  const [currentAdmin, setCurrentAdmin] = useState<ProfileResponse | null>(null);

  // Get current admin profile
  useEffect(() => {
    const loadAdminProfile = async () => {
      try {
        const profile = await getProfile();
        setCurrentAdmin(profile);
      } catch (error) {
        console.error('Failed to load admin profile:', error);
      }
    };
    
    loadAdminProfile();
  }, []);

  // Generate UID when component mounts or when account type changes
  useEffect(() => {
    const initializeUID = async () => {
      try {
        const count = await getCurrentAccountCount(formData.accountType);
        setAccountCount(count);
        const uid = generateUID(formData.accountType, count);
        setFormData(prev => ({ ...prev, uid }));
      } catch (error) {
        console.error('Failed to generate UID:', error);
        // Fallback to a simple timestamp-based UID
        const fallbackUID = generateUID(formData.accountType, 1);
        setFormData(prev => ({ ...prev, uid: fallbackUID }));
      }
    };
    
    initializeUID();
  }, [formData.accountType]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleAccountTypeSelect = (type: AccountType) => {
    setSelectedType(type);
    setFormData(prev => ({ ...prev, accountType: type }));
  };

  const validateForm = (): boolean => {
    if (!formData.username.trim()) {
      setStatus({ type: 'error', message: 'Please fill in all required fields.' });
      return false;
    }

    if (formData.password.length < 8) {
      setStatus({ type: 'error', message: 'Password must be at least 8 characters long.' });
      return false;
    }

    if (formData.password !== formData.confirmPassword) {
      setStatus({ type: 'error', message: 'Passwords do not match.' });
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    // Auto-generate display name if blank
    const finalDisplayName = formData.displayName.trim() || 
      (formData.accountType === 'admin' ? 'Administrator' : 
       formData.accountType === 'professor' ? 'Professor' : 'Registrar');
    
    if (!validateForm()) return;

    setStatus(null);
    setLoading(true);

    try {
      const accountData = {
        username: formData.username,
        displayName: finalDisplayName,
        accountType: formData.accountType,
        password: formData.password,
        uid: formData.uid
      };

      const result = await createAccount(accountData);
      
      setStatus({ type: 'success', message: result.message });
      
      // Reset form
      const newUID = generateUID('admin', accountCount + 1);
      setFormData({
        username: '',
        displayName: '',
        accountType: 'admin',
        password: '',
        confirmPassword: '',
        uid: newUID
      });
      setSelectedType('admin');
    } catch (err) {
      setStatus({ 
        type: 'error', 
        message: err instanceof Error ? err.message : 'Failed to create account. Please try again.' 
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="add-account-page">
      <header>
        <h1 className="add-account-title">Create New Account</h1>
        <p className="add-account-desc">Add a new staff to the system</p>
      </header>

      {/* Current Admin Role Display */}
      <div className="current-role-section">
        <div className="role-display-card">
          <div className="role-header">
            <Crown size={20} className="role-icon" />
            <h3 className="role-title">Current Session</h3>
          </div>
          <div className="role-info">
            <div className="role-details">
              <span className="role-label">Logged in as:</span>
              <span className="role-value">
                {currentAdmin?.displayName || currentAdmin?.username || 'Super Admin'}
              </span>
            </div>
            <div className="role-details">
              <span className="role-label">Role:</span>
              <span className="role-value super-admin">Super Admin</span>
            </div>
            <div className="role-details">
              <span className="role-label">Permissions:</span>
              <span className="role-value">Full system access</span>
            </div>
          </div>
        </div>
      </div>

      <form className="add-account-form" onSubmit={handleSubmit}>
        {status && (
          <div className={`add-account-status ${status.type === 'error' ? 'add-account-error' : 'add-account-success'}`} role="alert">
            {status.message}
          </div>
        )}

        {/* Account Type Selection */}
        <div className="account-type-section">
          <h2 className="section-title">Select Account Type</h2>
          <div className="account-types-grid">
            {accountTypes.map(({ type, label, icon: Icon, description, permissions }) => (
              <div
                key={type}
                className={`account-type-card ${selectedType === type ? 'selected' : ''}`}
                onClick={() => handleAccountTypeSelect(type as AccountType)}
              >
                <div className="account-type-header">
                  <Icon size={24} className="account-type-icon" />
                  <h3 className="account-type-label">{label}</h3>
                </div>
                <p className="account-type-description">{description}</p>
                <div className="account-type-permissions">
                  <h4>Permissions:</h4>
                  <ul>
                    {permissions.map((permission, index) => (
                      <li key={index}>{permission}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Account Details */}
        <div className="account-details-section">
          <h2 className="section-title">Account Details</h2>
          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="username" className="form-label">Username *</label>
              <input
                type="text"
                id="username"
                name="username"
                value={formData.username}
                onChange={handleChange}
                className="form-input"
                placeholder="Enter username"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="displayName" className="form-label">Display Name (Optional)</label>
              <input
                type="text"
                id="displayName"
                name="displayName"
                value={formData.displayName}
                onChange={handleChange}
                className="form-input"
                placeholder="Leave blank to auto-generate"
              />
            </div>

            <div className="form-group">
              <label htmlFor="role" className="form-label">Account Role</label>
              <input
                type="text"
                id="role"
                name="role"
                value={selectedType.charAt(0).toUpperCase() + selectedType.slice(1)}
                onChange={handleChange}
                className="form-input"
                placeholder="Account role"
                readOnly
                style={{ background: 'var(--color-surface-hover, rgba(0, 0, 0, 0.05))' }}
              />
            </div>

            <div className="form-group">
              <label htmlFor="uid" className="form-label">Unique ID (UID)</label>
              <input
                type="text"
                id="uid"
                name="uid"
                value={formData.uid}
                onChange={handleChange}
                className="form-input"
                placeholder="Auto-generated UID"
                readOnly
                style={{ background: 'var(--color-surface-hover, rgba(0, 0, 0, 0.05))' }}
              />
            </div>

            <div className="form-group">
              <label htmlFor="password" className="form-label">Password *</label>
              <input
                type="password"
                id="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                className="form-input"
                placeholder="Enter password (min. 8 characters)"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword" className="form-label">Confirm Password *</label>
              <input
                type="password"
                id="confirmPassword"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                className="form-input"
                placeholder="Confirm password"
                required
              />
            </div>
          </div>
        </div>

        <div className="form-actions">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button
              type="submit"
              className="add-account-submit"
              disabled={loading}
              style={{ minWidth: '200px' }}
            >
              {loading ? 'Creating Account...' : 'Create Account'}
            </button>
            <div 
              className="role-indicator"
              style={{
                padding: '0.5rem 1rem',
                background: 'var(--color-surface-hover, rgba(0, 0, 0, 0.05))',
                borderRadius: '8px',
                fontSize: '0.875rem',
                color: 'var(--color-text-muted)',
                fontWeight: '500',
                textTransform: 'capitalize',
                textAlign: 'center'
              }}
            >
              {selectedType}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

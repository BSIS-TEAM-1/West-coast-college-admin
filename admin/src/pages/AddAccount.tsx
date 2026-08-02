import React, { useState, useEffect } from 'react';
import { BookOpen, Check, Crown, Shield } from 'lucide-react';
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

type AccountInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'className'> & {
  label: string;
};

function AccountInput({ id, label, required, ...inputProps }: AccountInputProps) {
  return (
    <div className="form-group">
      <label htmlFor={id} className="form-label">
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      <input
        id={id}
        required={required}
        className="form-input"
        {...inputProps}
      />
    </div>
  );
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
  const selectedAccountType = accountTypes.find(({ type }) => type === selectedType) || accountTypes[0];
  const SelectedRoleIcon = selectedAccountType.icon;

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

      <section className="current-role-section" aria-labelledby="current-session-title">
        <div className="role-display-card">
          <div>
            <h2 id="current-session-title" className="role-title">Current Session</h2>
            <div className="session-identity">
              <span className="session-name">
                {currentAdmin?.displayName || currentAdmin?.username || 'Super Admin'}
              </span>
              <span className="session-access">Full system access</span>
            </div>
          </div>
          <span className="session-role-badge">Super Administrator</span>
        </div>
      </section>

      <form className="add-account-form" onSubmit={handleSubmit}>
        {status && (
          <div className={`add-account-status ${status.type === 'error' ? 'add-account-error' : 'add-account-success'}`} role="alert">
            {status.message}
          </div>
        )}

        <section className="account-type-section" aria-labelledby="account-role-title">
          <div className="section-heading">
            <h2 id="account-role-title" className="section-title">Choose User Role</h2>
            <p className="section-description">Select the access level for this new portal account.</p>
          </div>
          <div className="role-selection-layout">
            <fieldset className="role-radio-list">
              <legend className="sr-only">Account role</legend>
              {accountTypes.map(({ type, label, icon: Icon, description }) => (
                <label key={type} className={`role-radio-option ${selectedType === type ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="accountType"
                    value={type}
                    checked={selectedType === type}
                    onChange={() => handleAccountTypeSelect(type as AccountType)}
                  />
                  <span className="role-radio-control" aria-hidden="true" />
                  <Icon size={18} className="account-type-icon" />
                  <span className="role-radio-copy">
                    <span className="account-type-label">{label}</span>
                    <span className="account-type-description">{description}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            <aside className="selected-role-details" aria-live="polite">
              <div className="selected-role-header">
                <SelectedRoleIcon size={20} className="account-type-icon" />
                <div>
                  <h3>{selectedAccountType.label}</h3>
                  <p>{selectedAccountType.description}.</p>
                </div>
              </div>
              <div className="account-type-permissions">
                <h4>Permissions</h4>
                <ul>
                  {selectedAccountType.permissions.map((permission) => (
                    <li key={permission}>
                      <Check size={14} aria-hidden="true" />
                      <span>{permission}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </aside>
          </div>
        </section>

        {/* Account Details */}
        <section className="account-details-section" aria-labelledby="account-details-title">
          <div className="section-heading">
            <h2 id="account-details-title" className="section-title">Account Details</h2>
          </div>
          <div className="form-grid">
            <AccountInput
              type="text"
              id="username"
              name="username"
              label="Username"
              value={formData.username}
              onChange={handleChange}
              placeholder="Enter username"
              required
            />

            <AccountInput
              type="text"
              id="displayName"
              name="displayName"
              label="Display Name (Optional)"
              value={formData.displayName}
              onChange={handleChange}
              placeholder="Leave blank to auto-generate"
            />

            <AccountInput
              type="text"
              id="role"
              name="role"
              label="Account Role"
              value={selectedType.charAt(0).toUpperCase() + selectedType.slice(1)}
              onChange={handleChange}
              placeholder="Account role"
              readOnly
            />

            <AccountInput
              type="text"
              id="uid"
              name="uid"
              label="Unique ID (UID)"
              value={formData.uid}
              onChange={handleChange}
              placeholder="Auto-generated UID"
              readOnly
            />

            <AccountInput
              type="password"
              id="password"
              name="password"
              label="Password"
              value={formData.password}
              onChange={handleChange}
              placeholder="Enter password (min. 8 characters)"
              required
            />

            <AccountInput
              type="password"
              id="confirmPassword"
              name="confirmPassword"
              label="Confirm Password"
              value={formData.confirmPassword}
              onChange={handleChange}
              placeholder="Confirm password"
              required
            />
          </div>
        </section>

        <div className="form-actions">
          <button
            type="submit"
            className="add-account-submit"
            disabled={loading}
          >
            {loading ? 'Creating Account...' : 'Create Account'}
          </button>
        </div>
      </form>
    </div>
  );
}

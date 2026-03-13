import React, { useState, useMemo, useEffect } from 'react';
import { getProfile, updateProfile, clearStoredToken } from '../lib/authApi';
import type { ProfileResponse, UpdateProfileRequest } from '../lib/authApi';
import { LogOut } from 'lucide-react';
import { applyThemePreference, getStoredTheme, type ThemePreference } from '../lib/theme';
import './Settings.css';

type Theme = ThemePreference;

type SettingsProps = {
  onProfileUpdated?: (profile: ProfileResponse) => void;
  onLogout?: () => void;
};

export default function Settings({ onProfileUpdated, onLogout }: SettingsProps) {
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  // Theme state
  const [theme, setTheme] = useState<Theme>('auto');

  // Form state for security settings
  const [formData, setFormData] = useState({
    newUsername: '',
    currentPassword: '',
    newPassword: '',
    loginEmailVerificationEnabled: false,
  });

  // Load theme preference from localStorage on mount
  useEffect(() => {
    const initialTheme = getStoredTheme();
    setTheme(initialTheme);
    applyThemePreference(initialTheme, { persist: false });

    getProfile()
      .then((loadedProfile) => {
        setProfile(loadedProfile);
        setFormData((prev) => ({
          ...prev,
          loginEmailVerificationEnabled: Boolean(loadedProfile.loginEmailVerificationEnabled),
        }));
      })
      .catch((err) => {
        setStatus({
          type: 'error',
          message: err instanceof Error ? err.message : 'Failed to load security settings.',
        });
      });
  }, []);

  useEffect(() => {
    // Listen for system preference changes when in auto mode
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (theme === 'auto') {
        applyThemePreference('auto', { animate: true });
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  // Handle theme change
  const handleThemeChange = (newTheme: Theme) => {
    setTheme(newTheme);
    applyThemePreference(newTheme, { animate: true });
  };

  // Helper to detect if the user has actually changed anything
  const isDirty = useMemo(() => {
    return (
      formData.newUsername.trim().length > 0 ||
      formData.newPassword.length >= 6 ||
      Boolean(profile) && formData.loginEmailVerificationEnabled !== Boolean(profile?.loginEmailVerificationEnabled)
    );
  }, [formData, profile]);

  const canEnableLoginEmailVerification = Boolean(profile?.emailVerified && profile?.email);
  const loginEmailVerificationHint = canEnableLoginEmailVerification
    ? `A 6-digit code will be sent to ${profile?.email} every time you sign in.`
    : 'Verify an email address on your profile first before enabling login email verification.';

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, type, value, checked } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleSignOut = () => {
    clearStoredToken();
    onLogout?.();
  };

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isDirty) return;

    setStatus(null);

    if (formData.loginEmailVerificationEnabled && !canEnableLoginEmailVerification) {
      setStatus({
        type: 'error',
        message: 'Verify your email address in Profile before enabling login email verification.',
      });
      return;
    }
    
    // Password Validation Logic
    if (formData.newPassword && !formData.currentPassword) {
      setStatus({ type: 'error', message: 'Current password is required to set a new one.' });
      return;
    }

    setSaving(true);
    try {
      const updates: UpdateProfileRequest = {
        newUsername: formData.newUsername.trim() || undefined,
      };

      if (profile && formData.loginEmailVerificationEnabled !== Boolean(profile.loginEmailVerificationEnabled)) {
        updates.loginEmailVerificationEnabled = formData.loginEmailVerificationEnabled;
      }

      if (formData.newPassword.length >= 6) {
        updates.currentPassword = formData.currentPassword;
        updates.newPassword = formData.newPassword;
      }

      const updated = await updateProfile(updates);
      setProfile(updated);
      
      setFormData(prev => ({
        ...prev,
        newUsername: '',
        currentPassword: '',
        newPassword: '',
        loginEmailVerificationEnabled: Boolean(updated.loginEmailVerificationEnabled),
      }));
      setStatus({ type: 'success', message: 'Security settings updated successfully.' });
      onProfileUpdated?.(updated);
    } catch (err) {
      setStatus({ 
        type: 'error', 
        message: err instanceof Error ? err.message : 'Failed to update security settings.' 
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="settings-page">
      <header>
        <h2 className="settings-title">Settings</h2>
        <p className="settings-desc">Manage your preferences and security settings.</p>
      </header>

      <div className="settings-sections">
        {/* Theme Preferences */}
        <section className="settings-section">
          <h3 className="settings-section-title">Theme Preferences</h3>
          <p className="settings-section-desc">Choose how the application should appear.</p>
          
          <div className="theme-options">
            <div className="theme-option">
              <input
                type="radio"
                id="theme-light"
                name="theme"
                value="light"
                checked={theme === 'light'}
                onChange={() => handleThemeChange('light')}
                className="theme-radio"
              />
              <label htmlFor="theme-light" className="theme-label">
                <div className="theme-preview theme-light">
                  <div className="theme-preview-header"></div>
                  <div className="theme-preview-content">
                    <div className="theme-preview-line"></div>
                    <div className="theme-preview-line short"></div>
                  </div>
                </div>
                <div className="theme-info">
                  <div className="theme-name">Light Mode</div>
                  <div className="theme-description">Bright and clean interface</div>
                </div>
              </label>
            </div>

            <div className="theme-option">
              <input
                type="radio"
                id="theme-dark"
                name="theme"
                value="dark"
                checked={theme === 'dark'}
                onChange={() => handleThemeChange('dark')}
                className="theme-radio"
              />
              <label htmlFor="theme-dark" className="theme-label">
                <div className="theme-preview theme-dark">
                  <div className="theme-preview-header"></div>
                  <div className="theme-preview-content">
                    <div className="theme-preview-line"></div>
                    <div className="theme-preview-line short"></div>
                  </div>
                </div>
                <div className="theme-info">
                  <div className="theme-name">Dark Mode</div>
                  <div className="theme-description">Easy on the eyes in low light</div>
                </div>
              </label>
            </div>

            <div className="theme-option">
              <input
                type="radio"
                id="theme-auto"
                name="theme"
                value="auto"
                checked={theme === 'auto'}
                onChange={() => handleThemeChange('auto')}
                className="theme-radio"
              />
              <label htmlFor="theme-auto" className="theme-label">
                <div className="theme-preview theme-auto">
                  <div className="theme-preview-header"></div>
                  <div className="theme-preview-content">
                    <div className="theme-preview-line"></div>
                    <div className="theme-preview-line short"></div>
                  </div>
                </div>
                <div className="theme-info">
                  <div className="theme-name">Device Auto</div>
                  <div className="theme-description">Follows your system preference</div>
                </div>
              </label>
            </div>
          </div>
        </section>

        {/* Security Settings */}
        <section className="settings-section">
          <h3 className="settings-section-title">Security Settings</h3>
          <p className="settings-section-desc">Update your username and password.</p>

          <form className="settings-form" onSubmit={handleSubmit}>
            {status && (
              <p className={`settings-status ${status.type === 'error' ? 'settings-error' : 'settings-success'}`} role="alert">
                {status.message}
              </p>
            )}

            <fieldset className="settings-fieldset">
              <legend className="settings-legend">Change Username</legend>
              
              <div className="form-group">
                <label htmlFor="newUsername">New Username</label>
                <input
                  id="newUsername"
                  name="newUsername"
                  type="text"
                  className="settings-input"
                  value={formData.newUsername}
                  onChange={handleChange}
                  autoComplete="off"
                  placeholder="Enter new username"
                />
              </div>
            </fieldset>

            <fieldset className="settings-fieldset">
              <legend className="settings-legend">Change Password</legend>
              
              <div className="form-group">
                <label htmlFor="currentPassword">Current Password</label>
                <input
                  id="currentPassword"
                  name="currentPassword"
                  type="password"
                  className="settings-input"
                  value={formData.currentPassword}
                  onChange={handleChange}
                  placeholder="Confirm current password"
                  autoComplete="current-password"
                />
              </div>

              <div className="form-group">
                <label htmlFor="newPassword">New Password</label>
                <input
                  id="newPassword"
                  name="newPassword"
                  type="password"
                  className="settings-input"
                  value={formData.newPassword}
                  onChange={handleChange}
                  placeholder="Minimum 6 characters"
                  autoComplete="new-password"
                  minLength={6}
                />
              </div>
            </fieldset>

            <fieldset className="settings-fieldset">
              <legend className="settings-legend">Login Verification</legend>

              <label
                className={`settings-toggle-card ${!canEnableLoginEmailVerification && !formData.loginEmailVerificationEnabled ? 'is-disabled' : ''}`}
                htmlFor="loginEmailVerificationEnabled"
              >
                <div className="settings-toggle-copy">
                  <span className="settings-toggle-title">Enable Email Verification on Login</span>
                  <span className="settings-toggle-description">{loginEmailVerificationHint}</span>
                </div>
                <span className="settings-toggle-control">
                  <input
                    id="loginEmailVerificationEnabled"
                    name="loginEmailVerificationEnabled"
                    type="checkbox"
                    className="settings-toggle-input"
                    checked={formData.loginEmailVerificationEnabled}
                    onChange={handleChange}
                    disabled={!canEnableLoginEmailVerification && !formData.loginEmailVerificationEnabled}
                  />
                  <span className="settings-toggle-slider" aria-hidden="true" />
                </span>
              </label>
            </fieldset>

            <button 
              type="submit" 
              className="settings-submit" 
              disabled={saving || !isDirty}
            >
              {saving ? 'Saving changes...' : 'Save Changes'}
            </button>
          </form>
        </section>

        {/* Sign Out Section */}
        <section className="settings-section">
          <h3 className="settings-section-title">Sign Out</h3>
          <p className="settings-section-desc">Sign out of your admin account.</p>
          
          <button 
            type="button" 
            className="settings-signout-btn"
            onClick={handleSignOut}
          >
            <LogOut size={18} />
            Sign Out
          </button>
        </section>
      </div>
    </div>
  );
}

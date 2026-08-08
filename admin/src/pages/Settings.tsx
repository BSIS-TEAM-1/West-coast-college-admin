import React, { useState, useMemo, useEffect } from 'react';
import { getProfile, updateProfile, clearStoredToken } from '../lib/authApi';
import type { ProfileResponse, UpdateProfileRequest } from '../lib/authApi';
import { LogOut } from 'lucide-react';
import {
  applyAccentColorPreference,
  applyThemePreference,
  DEFAULT_THEME_ACCENT_COLOR,
  getStoredTheme,
  type ThemePreference,
} from '../lib/theme';
import { getAcademicTerm, updateAcademicTerm, type AcademicSemester } from '../lib/settingsApi';
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

  // Academic term (global current school year) state
  const [academicTerm, setAcademicTerm] = useState<{ schoolYear: string; semester: AcademicSemester } | null>(null);
  const [academicTermDraft, setAcademicTermDraft] = useState({ schoolYear: '', semester: '1st' as AcademicSemester });
  const [academicTermLoading, setAcademicTermLoading] = useState(true);
  const [academicTermSaving, setAcademicTermSaving] = useState(false);
  const [academicTermStatus, setAcademicTermStatus] = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  useEffect(() => {
    getAcademicTerm()
      .then((term) => {
        setAcademicTerm(term);
        setAcademicTermDraft(term);
      })
      .catch((err) => {
        setAcademicTermStatus({
          type: 'error',
          message: err instanceof Error ? err.message : 'Failed to load academic term setting.',
        });
      })
      .finally(() => setAcademicTermLoading(false));
  }, []);

  const academicTermDirty = Boolean(
    academicTerm &&
    (academicTermDraft.schoolYear !== academicTerm.schoolYear || academicTermDraft.semester !== academicTerm.semester)
  );

  const handleAcademicTermSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!academicTermDirty) return;

    if (!/^\d{4}-\d{4}$/.test(academicTermDraft.schoolYear.trim())) {
      setAcademicTermStatus({ type: 'error', message: 'School year must be in YYYY-YYYY format.' });
      return;
    }

    setAcademicTermSaving(true);
    setAcademicTermStatus(null);
    try {
      const updated = await updateAcademicTerm({
        schoolYear: academicTermDraft.schoolYear.trim(),
        semester: academicTermDraft.semester,
      });
      setAcademicTerm(updated);
      setAcademicTermDraft(updated);
      setAcademicTermStatus({ type: 'success', message: 'Academic term updated successfully.' });
    } catch (err) {
      setAcademicTermStatus({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to update academic term setting.',
      });
    } finally {
      setAcademicTermSaving(false);
    }
  };

  // Load theme preference from localStorage on mount
  useEffect(() => {
    const initialTheme = getStoredTheme();
    setTheme(initialTheme);
    applyThemePreference(initialTheme, { persist: false });
    applyAccentColorPreference(DEFAULT_THEME_ACCENT_COLOR, { persist: true });

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

  const themeLabel = theme === 'auto' ? 'Device Auto' : theme === 'dark' ? 'Dark Mode' : 'Light Mode';
  const loginVerificationStatus = formData.loginEmailVerificationEnabled ? 'Enabled' : 'Disabled';
  const emailStatus = profile?.email
    ? profile.emailVerified
      ? 'Verified email'
      : 'Verification pending'
    : 'No email linked';

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
    ? `A 6-digit code will be sent to ${profile?.email} during email-based sign-in verification.`
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
      <header className="settings-hero">
        <div className="settings-hero-copy">
          <p className="settings-eyebrow">Admin Preferences</p>
          <h2 className="settings-title">Settings</h2>
          <p className="settings-desc">Manage appearance, account security, and sign-in safeguards from one place.</p>
        </div>

        <div className="settings-hero-stats" aria-label="Settings summary">
          <article className="settings-hero-stat">
            <span className="settings-hero-stat-label">Theme</span>
            <strong>{themeLabel}</strong>
            <span className="settings-hero-stat-meta">Appearance mode</span>
          </article>
          <article className="settings-hero-stat">
            <span className="settings-hero-stat-label">Login Verification</span>
            <strong>{loginVerificationStatus}</strong>
            <span className="settings-hero-stat-meta">Email code on sign-in</span>
          </article>
          <article className="settings-hero-stat">
            <span className="settings-hero-stat-label">Profile Email</span>
            <strong>{emailStatus}</strong>
            <span className="settings-hero-stat-meta">{profile?.email ?? 'Add one in Profile'}</span>
          </article>
        </div>
      </header>

      {status && (
        <p className={`settings-status ${status.type === 'error' ? 'settings-error' : 'settings-success'}`} role="alert">
          {status.message}
        </p>
      )}

      <div className="settings-content">
        <section className="settings-section settings-section-appearance">
          <div className="settings-section-header">
            <div>
              <span className="settings-section-kicker">Appearance</span>
              <h3 className="settings-section-title">Theme Mode</h3>
              <p className="settings-section-desc">Keep the interface consistent while choosing the brightness mode that fits your workspace.</p>
            </div>
          </div>

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

        {profile?.accountType !== 'professor' ? (
          <form className="settings-form" onSubmit={handleAcademicTermSubmit}>
            <section className="settings-section">
              <div className="settings-section-header">
                <div>
                  <span className="settings-section-kicker">Academic</span>
                  <h3 className="settings-section-title">Current School Year</h3>
                  <p className="settings-section-desc">
                    This is the default school year and semester used when creating new students and block groups. Individual records can still be created for other terms when needed.
                  </p>
                </div>
              </div>

              {academicTermStatus && (
                <p className={`settings-status ${academicTermStatus.type === 'error' ? 'settings-error' : 'settings-success'}`} role="alert">
                  {academicTermStatus.message}
                </p>
              )}

              <div className="settings-card-body settings-two-col">
                <div className="form-group">
                  <label htmlFor="academicTermSchoolYear">School Year</label>
                  <input
                    id="academicTermSchoolYear"
                    name="schoolYear"
                    type="text"
                    className="settings-input"
                    placeholder="e.g. 2025-2026"
                    pattern="\d{4}-\d{4}"
                    value={academicTermDraft.schoolYear}
                    onChange={(event) => setAcademicTermDraft((prev) => ({ ...prev, schoolYear: event.target.value }))}
                    disabled={academicTermLoading}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="academicTermSemester">Semester</label>
                  <select
                    id="academicTermSemester"
                    name="semester"
                    className="settings-input"
                    value={academicTermDraft.semester}
                    onChange={(event) => setAcademicTermDraft((prev) => ({ ...prev, semester: event.target.value as AcademicSemester }))}
                    disabled={academicTermLoading}
                  >
                    <option value="1st">1st Semester</option>
                    <option value="2nd">2nd Semester</option>
                    <option value="Summer">Summer</option>
                  </select>
                </div>
              </div>

              <div className="settings-save-panel">
                <div>
                  <span className="settings-save-title">Academic Term Changes</span>
                  <span className="settings-save-copy">
                    {academicTermDirty ? 'Review and save the updated school year/semester.' : 'No pending changes.'}
                  </span>
                </div>
                <button
                  type="submit"
                  className="settings-submit"
                  disabled={academicTermLoading || academicTermSaving || !academicTermDirty}
                >
                  {academicTermSaving ? 'Saving changes...' : 'Save Changes'}
                </button>
              </div>
            </section>
          </form>
        ) : null}

        <form className="settings-form" onSubmit={handleSubmit}>
          <div className="settings-form-grid">
            <section className="settings-section">
              <div className="settings-section-header">
                <div>
                  <span className="settings-section-kicker">Account</span>
                  <h3 className="settings-section-title">Username</h3>
                  <p className="settings-section-desc">Update the username used for admin sign-in.</p>
                </div>
              </div>

              <div className="settings-card-body">
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
              </div>
            </section>

            <section className="settings-section">
              <div className="settings-section-header">
                <div>
                  <span className="settings-section-kicker">Security</span>
                  <h3 className="settings-section-title">Password</h3>
                  <p className="settings-section-desc">Set a new password after confirming the current one.</p>
                </div>
              </div>

              <div className="settings-card-body settings-two-col">
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
              </div>
            </section>

            <section className="settings-section">
              <div className="settings-section-header">
                <div>
                  <span className="settings-section-kicker">Access Control</span>
                  <h3 className="settings-section-title">Login Verification</h3>
                  <p className="settings-section-desc">Require a one-time email code during sign-in for this account.</p>
                </div>
              </div>

              <label
                className={`settings-toggle-card ${!canEnableLoginEmailVerification && !formData.loginEmailVerificationEnabled ? 'is-disabled' : ''}`}
                htmlFor="loginEmailVerificationEnabled"
              >
                <div className="settings-toggle-copy">
                  <span className="settings-toggle-title">Email Code on Login</span>
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
            </section>

            <section className="settings-section">
              <div className="settings-section-header">
                <div>
                  <span className="settings-section-kicker">Session</span>
                  <h3 className="settings-section-title">Sign Out</h3>
                  <p className="settings-section-desc">End the current admin session on this device.</p>
                </div>
              </div>

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

          <div className="settings-save-panel">
            <div>
              <span className="settings-save-title">Security Changes</span>
              <span className="settings-save-copy">
                {isDirty ? 'Review and save your pending account changes.' : 'No pending security changes.'}
              </span>
            </div>
            <button
              type="submit"
              className="settings-submit"
              disabled={saving || !isDirty}
            >
              {saving ? 'Saving changes...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

import React, { useState, useMemo, useEffect } from 'react';
import { getProfile, updateProfile, clearStoredToken } from '../lib/authApi';
import type { ProfileResponse, UpdateProfileRequest } from '../lib/authApi';
import {
  applyAccentColorPreference,
  applyThemePreference,
  getAccentColorForUser,
  getStoredAccentColor,
  getStoredTheme,
  setAccentColorForUser,
  THEME_ACCENT_PRESETS,
  type ThemeAccentColor,
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

  // Accent color state
  const [accentColor, setAccentColor] = useState<ThemeAccentColor>(() => getStoredAccentColor());
  const [initialAccentColor, setInitialAccentColor] = useState<ThemeAccentColor>(() => getStoredAccentColor());

  const handleAccentChange = (color: ThemeAccentColor) => {
    setAccentColor(color);
    applyAccentColorPreference(color, { animate: true });
  };

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

    getProfile()
      .then((loadedProfile) => {
        setProfile(loadedProfile);
        setFormData((prev) => ({
          ...prev,
          loginEmailVerificationEnabled: Boolean(loadedProfile.loginEmailVerificationEnabled),
        }));

        // Load accent color from user profile or fallback to stored
        const userAccentColor = loadedProfile.accentColor || getStoredAccentColor();
        setAccentColor(userAccentColor);
        setInitialAccentColor(userAccentColor);
        applyAccentColorPreference(userAccentColor, { persist: false });
        setAccentColorForUser(loadedProfile.username, userAccentColor);
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

  const themeLabel = theme === 'auto' ? 'System (Auto)' : theme === 'dark' ? 'Dark Mode' : 'Light Mode';
  const loginVerificationStatus = formData.loginEmailVerificationEnabled ? 'Enabled' : 'Disabled';

  // Helper to detect if the user has actually changed anything
  const isDirty = useMemo(() => {
    return (
      formData.newUsername.trim().length > 0 ||
      formData.newPassword.length >= 6 ||
      Boolean(profile) && formData.loginEmailVerificationEnabled !== Boolean(profile?.loginEmailVerificationEnabled) ||
      accentColor !== initialAccentColor
    );
  }, [formData, profile, accentColor, initialAccentColor]);

  const canEnableLoginEmailVerification = Boolean(profile?.emailVerified && profile?.email);

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

      if (accentColor !== initialAccentColor) {
        updates.accentColor = accentColor;
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
      setInitialAccentColor(accentColor);
      setAccentColorForUser(updated.username, accentColor);
      setStatus({ type: 'success', message: 'Settings updated successfully.' });
      onProfileUpdated?.(updated);
    } catch (err) {
      setStatus({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to update settings.'
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="settings-page">
      <header className="settings-hero">
        <div className="settings-hero-top">
          <div className="settings-hero-copy">
            <p className="settings-eyebrow">Admin Preferences</p>
            <h2 className="settings-title">Settings</h2>
          </div>
          <button
            type="button"
            className="settings-hero-save-btn"
            onClick={() => handleSubmit({ preventDefault: () => {} } as React.FormEvent<HTMLFormElement>)}
            disabled={saving || !isDirty}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>

        <div className="settings-hero-stats" aria-label="Settings summary">
          <article className="settings-hero-stat">
            <span className="settings-hero-stat-icon material-symbols-outlined" aria-hidden="true">palette</span>
            <div className="settings-hero-stat-text">
              <span className="settings-hero-stat-label">Theme</span>
              <strong>{themeLabel}</strong>
            </div>
          </article>
          <article className="settings-hero-stat">
            <span className="settings-hero-stat-icon material-symbols-outlined" aria-hidden="true">verified_user</span>
            <div className="settings-hero-stat-text">
              <span className="settings-hero-stat-label">Login Verification</span>
              <strong className={loginVerificationStatus === 'Enabled' ? 'is-primary' : ''}>{loginVerificationStatus}</strong>
            </div>
          </article>
          <article className="settings-hero-stat">
            <span className="settings-hero-stat-icon material-symbols-outlined" aria-hidden="true">account_circle</span>
            <div className="settings-hero-stat-text">
              <span className="settings-hero-stat-label">Profile Email</span>
              <strong className="settings-hero-stat-email">{profile?.email ?? 'No email linked'}</strong>
            </div>
          </article>
        </div>
      </header>

      {status && (
        <p className={`settings-status ${status.type === 'error' ? 'settings-error' : 'settings-success'}`} role="alert">
          {status.message}
        </p>
      )}

      <div className="settings-content">
        <div className="settings-bento-grid">
          {/* Appearance & Theme — full width */}
          <section className="settings-card settings-card-appearance">
            <div className="settings-card-label-col">
              <span className="settings-card-kicker">Appearance</span>
              <p className="settings-card-label-title">Theme &amp; Accent</p>
            </div>
            <div className="settings-card-body-col">
              <div className="theme-options-compact" role="radiogroup" aria-label="Theme mode">
                <label className={`theme-card-compact ${theme === 'light' ? 'is-selected' : ''}`}>
                  <input
                    type="radio"
                    name="theme"
                    value="light"
                    checked={theme === 'light'}
                    onChange={() => handleThemeChange('light')}
                    className="theme-radio"
                  />
                  <span className="theme-card-compact-info">
                    <span className="theme-card-compact-name">
                      <span className="material-symbols-outlined theme-card-icon" aria-hidden="true">light_mode</span>
                      Light
                    </span>
                    <span className="theme-card-compact-desc">Bright interface</span>
                  </span>
                </label>

                <label className={`theme-card-compact ${theme === 'dark' ? 'is-selected' : ''}`}>
                  <input
                    type="radio"
                    name="theme"
                    value="dark"
                    checked={theme === 'dark'}
                    onChange={() => handleThemeChange('dark')}
                    className="theme-radio"
                  />
                  <span className="theme-card-compact-info">
                    <span className="theme-card-compact-name">
                      <span className="material-symbols-outlined theme-card-icon" aria-hidden="true">dark_mode</span>
                      Dark
                    </span>
                    <span className="theme-card-compact-desc">Low light</span>
                  </span>
                </label>

                <label className={`theme-card-compact ${theme === 'auto' ? 'is-selected' : ''}`}>
                  <input
                    type="radio"
                    name="theme"
                    value="auto"
                    checked={theme === 'auto'}
                    onChange={() => handleThemeChange('auto')}
                    className="theme-radio"
                  />
                  <span className="theme-card-compact-info">
                    <span className="theme-card-compact-name">
                      <span className="material-symbols-outlined theme-card-icon" aria-hidden="true">desktop_windows</span>
                      System
                    </span>
                    <span className="theme-card-compact-desc">Auto match</span>
                  </span>
                </label>
              </div>

              <div className="accent-chip-row">
                <span className="accent-chip-label">Accent Color</span>
                <div className="accent-chips" role="radiogroup" aria-label="Accent color presets">
                  {THEME_ACCENT_PRESETS.map((preset) => {
                    const isChecked = accentColor.toLowerCase() === preset.color.toLowerCase();
                    return (
                      <button
                        type="button"
                        key={preset.id}
                        className={`accent-chip ${isChecked ? 'is-selected' : ''}`}
                        style={{ ['--swatch-color' as string]: preset.color }}
                        onClick={() => handleAccentChange(preset.color)}
                        aria-label={`${preset.label} — ${preset.description}`}
                        aria-pressed={isChecked}
                        title={`${preset.label} — ${preset.description}`}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          {/* Academic Setup — half width */}
          {profile?.accountType !== 'professor' ? (
            <form className="settings-card" onSubmit={handleAcademicTermSubmit}>
              <div className="settings-card-header">
                <h4 className="settings-card-header-title">Academic Setup</h4>
              </div>

              <div className="settings-card-body">
                {academicTermStatus && (
                  <p className={`settings-status ${academicTermStatus.type === 'error' ? 'settings-error' : 'settings-success'}`} role="alert">
                    {academicTermStatus.message}
                  </p>
                )}
                <div className="settings-card-body-grid">
                  <div className="form-group">
                    <label htmlFor="academicTermSchoolYear" className="settings-field-label">School Year</label>
                    <input
                      id="academicTermSchoolYear"
                      name="schoolYear"
                      type="text"
                      className="settings-input"
                      placeholder="YYYY-YYYY"
                      pattern="\d{4}-\d{4}"
                      value={academicTermDraft.schoolYear}
                      onChange={(event) => setAcademicTermDraft((prev) => ({ ...prev, schoolYear: event.target.value }))}
                      disabled={academicTermLoading}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="academicTermSemester" className="settings-field-label">Semester</label>
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
                <p className="settings-card-hint">Default term for new student enrollments.</p>
              </div>

              <div className="settings-card-footer">
                <span className="settings-card-footer-status">
                  {academicTermDirty ? 'Review and save changes' : 'No pending changes'}
                </span>
                <button
                  type="submit"
                  className="settings-card-save-btn"
                  disabled={academicTermLoading || academicTermSaving || !academicTermDirty}
                >
                  {academicTermSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          ) : null}

          {/* Account Details — half width */}
          <form className="settings-card" onSubmit={handleSubmit}>
            <div className="settings-card-header">
              <h4 className="settings-card-header-title">Account Details</h4>
            </div>

            <div className="settings-card-body">
              <div className="form-group">
                <label htmlFor="newUsername" className="settings-field-label">New Username</label>
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
              <p className="settings-card-hint">Update your login identifier.</p>
            </div>

            <div className="settings-card-footer">
              <span className="settings-card-footer-status">
                {formData.newUsername.trim() ? 'Review and save changes' : 'No pending changes'}
              </span>
              <button
                type="submit"
                className="settings-card-save-btn"
                disabled={saving || !isDirty}
              >
                Save
              </button>
            </div>
          </form>

          {/* Security — half width */}
          <form className="settings-card" onSubmit={handleSubmit}>
            <div className="settings-card-header">
              <h4 className="settings-card-header-title">Security</h4>
            </div>

            <div className="settings-card-body">
              <div className="settings-card-body-grid">
                <div className="form-group">
                  <label htmlFor="currentPassword" className="settings-field-label">Current Password</label>
                  <input
                    id="currentPassword"
                    name="currentPassword"
                    type="password"
                    className="settings-input"
                    value={formData.currentPassword}
                    onChange={handleChange}
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="newPassword" className="settings-field-label">New Password</label>
                  <input
                    id="newPassword"
                    name="newPassword"
                    type="password"
                    className="settings-input"
                    value={formData.newPassword}
                    onChange={handleChange}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    minLength={6}
                  />
                </div>
              </div>
            </div>

            <div className="settings-card-footer">
              <span className="settings-card-footer-status">
                {formData.newPassword.length >= 6 ? 'Review and save changes' : 'No pending changes'}
              </span>
              <button
                type="submit"
                className="settings-card-save-btn"
                disabled={saving || !isDirty}
              >
                Update Password
              </button>
            </div>
          </form>

          {/* Access & Session — half width */}
          <form className="settings-card" onSubmit={handleSubmit}>
            <div className="settings-card-header">
              <h4 className="settings-card-header-title">Access &amp; Session</h4>
            </div>

            <div className="settings-card-body">
              <label
                className={`settings-toggle-card ${!canEnableLoginEmailVerification && !formData.loginEmailVerificationEnabled ? 'is-disabled' : ''}`}
                htmlFor="loginEmailVerificationEnabled"
              >
                <div className="settings-toggle-copy">
                  <span className="settings-toggle-title">Email Code on Login</span>
                  <span className="settings-toggle-description">Require verification code sent to email</span>
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

              <div className="settings-signout-section">
                <button
                  type="button"
                  className="settings-signout-btn"
                  onClick={handleSignOut}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">logout</span>
                  Sign Out
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

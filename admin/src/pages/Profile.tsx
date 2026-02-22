import React, { useState, useEffect, useMemo, useRef } from 'react';
import { getProfile, updateProfile, uploadAvatar, sendPhoneVerificationCode, verifyPhoneNumber } from '../lib/authApi';
import { Edit, Info } from 'lucide-react';
import type { ProfileResponse, UpdateProfileRequest } from '../lib/authApi';
import './Profile.css';

type ProfileProps = {
  onProfileUpdated?: (profile: ProfileResponse) => void;
  onNavigate?: (view: string) => void;
};

const MAX_AVATAR_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];

const normalizePhoneNumber = (rawPhone: string): string => {
  const normalized = String(rawPhone || '').trim();
  if (!normalized) return '';

  const compactNumber = normalized.replace(/[()\-\s]/g, '');
  if (compactNumber.startsWith('+63')) {
    return `0${compactNumber.slice(3)}`;
  }
  if (compactNumber.startsWith('63')) {
    return `0${compactNumber.slice(2)}`;
  }
  if (compactNumber.startsWith('9') && compactNumber.length === 10) {
    return `0${compactNumber}`;
  }

  return compactNumber;
};

const isCompletePhoneNumber = (normalizedPhone: string): boolean => /^09\d{9}$/.test(normalizedPhone);

export default function Profile({ onProfileUpdated, onNavigate }: ProfileProps) {
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [verifyingPhone, setVerifyingPhone] = useState(false);
  const [phoneEditMode, setPhoneEditMode] = useState(false);
  const [status, setStatus] = useState<{ type: 'error' | 'success'; message: string } | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarLoadError, setAvatarLoadError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const toastTimerRef = useRef<number | null>(null);

  const [formData, setFormData] = useState({
    displayName: '',
    email: '',
    phone: '',
    username: '',
  });

  useEffect(() => {
    getProfile()
      .then((p) => {
        setProfile(p);
        setFormData({
          displayName: p.displayName,
          email: p.email,
          phone: p.phone || '',
          username: p.username,
        });
        setPhoneEditMode(false);
        setAvatarLoadError(false);
      })
      .catch((err) =>
        setStatus({
          type: 'error',
          message: err instanceof Error ? err.message : 'Failed to load profile',
        })
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const showToastNotification = (type: 'error' | 'success', message: string) => {
    setStatus({ type, message });
    setShowToast(true);

    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }

    toastTimerRef.current = setTimeout(() => {
      setShowToast(false);
    }, 3000) as unknown as number;
  };

  const isDirty = useMemo(() => {
    if (!profile) return false;
    return (
      formData.displayName !== profile.displayName ||
      formData.email !== profile.email ||
      normalizePhoneNumber(formData.phone) !== normalizePhoneNumber(profile.phone || '')
    );
  }, [formData, profile]);

  const accountTypeLabel = useMemo(() => {
    if (!profile) return '';
    return `${profile.accountType.charAt(0).toUpperCase()}${profile.accountType.slice(1)}`;
  }, [profile]);

  const normalizedPhoneInput = useMemo(() => normalizePhoneNumber(formData.phone), [formData.phone]);
  const normalizedProfilePhone = useMemo(() => normalizePhoneNumber(profile?.phone || ''), [profile?.phone]);
  const hasPhoneInput = Boolean(formData.phone.trim());
  const isPhoneComplete = isCompletePhoneNumber(normalizedPhoneInput);
  const isStoredPhoneVerified = Boolean(profile?.phoneVerified) && Boolean(normalizedProfilePhone);
  const isCurrentPhoneStored = Boolean(normalizedPhoneInput) && normalizedPhoneInput === normalizedProfilePhone;
  const activePhoneIsVerified = isStoredPhoneVerified && isCurrentPhoneStored;
  const phoneInputLocked = activePhoneIsVerified && !phoneEditMode;
  const showVerifyButton = !activePhoneIsVerified && isPhoneComplete;
  const showPhoneActionButton = activePhoneIsVerified || showVerifyButton;
  const phoneVerificationHint = activePhoneIsVerified
    ? 'Phone number is verified.'
    : showVerifyButton
      ? 'Click Verify to confirm this number through SMS.'
      : hasPhoneInput
        ? 'Enter a complete 11-digit mobile number to enable verification.'
        : 'Add a mobile number, then verify it through SMS.';

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === 'phone') {
      const sanitizedPhone = value.replace(/[^\d+\-\s()]/g, '');
      setFormData((prev) => ({ ...prev, [name]: sanitizedPhone }));
      if (profile?.phoneVerified) {
        const normalizedIncomingPhone = normalizePhoneNumber(sanitizedPhone);
        if (normalizedIncomingPhone !== normalizedProfilePhone) {
          setPhoneEditMode(true);
        }
      }
      return;
    }
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handlePhoneAction = async () => {
    if (!profile) return;

    if (activePhoneIsVerified) {
      setPhoneEditMode(true);
      phoneInputRef.current?.focus();
      phoneInputRef.current?.select();
      return;
    }

    if (!showVerifyButton) {
      showToastNotification('error', 'Enter a complete 11-digit mobile number before verifying.');
      return;
    }

    setVerifyingPhone(true);
    setStatus(null);

    try {
      await sendPhoneVerificationCode(normalizedPhoneInput);

      const enteredCode = window.prompt(
        `Verification code sent to ${normalizedPhoneInput}. Enter the 6-digit code:`,
        ''
      );

      if (enteredCode === null) {
        showToastNotification('success', 'Verification code sent. Verify anytime by clicking Verify again.');
        return;
      }

      const code = enteredCode.trim();
      if (!/^\d{6}$/.test(code)) {
        showToastNotification('error', 'Please enter a valid 6-digit verification code.');
        return;
      }

      const verifiedProfile = await verifyPhoneNumber(code);
      setProfile(verifiedProfile);
      setFormData((prev) => ({
        ...prev,
        username: verifiedProfile.username,
        displayName: verifiedProfile.displayName,
        email: verifiedProfile.email,
        phone: verifiedProfile.phone || '',
      }));
      setPhoneEditMode(false);
      showToastNotification('success', 'Phone number verified successfully.');
      onProfileUpdated?.(verifiedProfile);
    } catch (err) {
      showToastNotification('error', err instanceof Error ? err.message : 'Failed to verify phone number.');
    } finally {
      setVerifyingPhone(false);
    }
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_AVATAR_SIZE) {
      showToastNotification('error', 'File size must be less than 5MB.');
      return;
    }

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      showToastNotification('error', 'Only image files (JPEG, JPG, PNG, GIF, WebP) are allowed.');
      return;
    }

    setUploadingAvatar(true);

    try {
      const result = await uploadAvatar(file);
      setAvatarLoadError(false);
      setProfile((prev) => (prev ? { ...prev, avatar: result.avatar } : null));
      showToastNotification('success', 'Avatar uploaded successfully.');
      if (profile) {
        onProfileUpdated?.({ ...profile, avatar: result.avatar });
      }
    } catch (err) {
      showToastNotification('error', err instanceof Error ? err.message : 'Failed to upload avatar.');
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!profile || !isDirty) return;

    setStatus(null);
    setSaving(true);

    try {
      const updates: UpdateProfileRequest = {
        displayName: formData.displayName.trim() || undefined,
        email: formData.email.trim() || undefined,
      };
      updates.phone = formData.phone.trim();

      const updated = await updateProfile(updates);
      setProfile(updated);
      setFormData((prev) => ({ ...prev, displayName: updated.displayName, email: updated.email, phone: updated.phone || '' }));
      setPhoneEditMode(false);
      showToastNotification('success', 'Profile updated successfully.');
      onProfileUpdated?.(updated);
    } catch (err) {
      showToastNotification('error', err instanceof Error ? err.message : 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="profile-page">
        <p className="profile-muted">Loading profile...</p>
      </div>
    );
  }

  return (
    <div className="profile-page">
      <header className="profile-header">
        <h2 className="profile-title">Profile</h2>
        <p className="profile-desc">Keep your account details accurate and maintain a professional profile image.</p>
      </header>

      <form className="profile-form" onSubmit={handleSubmit}>
        <div className="profile-layout">
          <section className="profile-panel profile-panel-avatar" aria-label="Avatar and account summary">
            <label className="profile-label profile-avatar-label">Profile Picture</label>

            <button
              type="button"
              onClick={handleAvatarClick}
              className="profile-avatar-button"
              title="Click to change avatar"
              disabled={uploadingAvatar}
            >
              {profile?.avatar && !avatarLoadError ? (
                <img
                  src={profile.avatar.startsWith('data:') ? profile.avatar : `data:image/jpeg;base64,${profile.avatar}`}
                  alt="Profile avatar"
                  className="profile-page-avatar"
                  onError={() => setAvatarLoadError(true)}
                />
              ) : (
                <div className="profile-avatar-placeholder">
                  <span>{formData.displayName?.trim()?.charAt(0)?.toUpperCase() || 'U'}</span>
                </div>
              )}

              <span className="profile-edit-overlay" aria-hidden="true">
                {uploadingAvatar ? 'Uploading...' : <Edit size={22} />}
              </span>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
              onChange={handleAvatarChange}
              className="profile-file-input"
            />

            <p className="profile-avatar-hint">JPG, PNG, GIF or WebP. Maximum file size: 5MB.</p>

            <div className="profile-account-meta">
              <span className="profile-account-role">{accountTypeLabel}</span>
              <span className="profile-account-username">@{formData.username}</span>
            </div>
          </section>

          <section className="profile-panel" aria-label="Account information">
            <div className="form-group">
              <label className="profile-label" htmlFor="username">Username</label>
              <input id="username" type="text" className="profile-input profile-input-readonly" value={formData.username} readOnly tabIndex={-1} />
            </div>

            <div className="form-group">
              <label htmlFor="displayName" className="profile-label">Display Name</label>
              <input
                id="displayName"
                name="displayName"
                type="text"
                className="profile-input"
                value={formData.displayName}
                onChange={handleChange}
                autoComplete="name"
              />
            </div>

            <div className="form-group">
              <label htmlFor="email" className="profile-label">Email Address</label>
              <input
                id="email"
                name="email"
                type="email"
                className="profile-input"
                value={formData.email}
                onChange={handleChange}
                autoComplete="email"
              />
            </div>

            <div className="form-group">
              <label htmlFor="phone" className="profile-label">Phone Number</label>
              <div className="profile-input-action-wrap">
                <input
                  ref={phoneInputRef}
                  id="phone"
                  name="phone"
                  type="tel"
                  className={`profile-input ${showPhoneActionButton ? 'profile-input-has-action' : ''}`}
                  value={formData.phone}
                  onChange={handleChange}
                  autoComplete="tel"
                  placeholder="09XXXXXXXXX"
                  readOnly={phoneInputLocked}
                />
                {showPhoneActionButton && (
                  <button
                    type="button"
                    className="profile-input-action-btn"
                    onClick={handlePhoneAction}
                    disabled={saving || verifyingPhone}
                  >
                    {activePhoneIsVerified ? 'Edit' : (verifyingPhone ? 'Verifying...' : 'Verify')}
                  </button>
                )}
              </div>
              <p className={`profile-verify-hint ${activePhoneIsVerified ? 'verified' : 'unverified'}`}>
                {phoneVerificationHint}
              </p>
            </div>

            <div className="profile-actions">
              <button type="button" className="profile-info-btn" onClick={() => onNavigate?.('personal-details')}>
                <Info size={16} />
                View Personal Details
              </button>

              <button type="submit" className="profile-submit" disabled={saving || !isDirty}>
                {saving ? 'Saving changes...' : 'Save Changes'}
              </button>
            </div>
          </section>
        </div>
      </form>

      {status && (
        <div className={`profile-toast ${status.type} ${showToast ? 'show' : ''}`} role="alert">
          {status.message}
        </div>
      )}
    </div>
  );
}

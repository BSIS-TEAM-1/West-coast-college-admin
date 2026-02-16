import React, { useState, useEffect, useMemo, useRef } from 'react';
import { getProfile, updateProfile, uploadAvatar } from '../lib/authApi';
import { Edit, Info } from 'lucide-react';
import type { ProfileResponse, UpdateProfileRequest } from '../lib/authApi';
import './Profile.css';

type ProfileProps = {
  onProfileUpdated?: (profile: ProfileResponse) => void;
  onNavigate?: (view: string) => void;
};

export default function Profile({ onProfileUpdated, onNavigate }: ProfileProps) {
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: 'error' | 'success'; message: string } | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [isAvatarHovered, setIsAvatarHovered] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toastTimerRef = useRef<number | null>(null);

  // Consolidated form state
  const [formData, setFormData] = useState({
    displayName: '',
    email: '',
    username: '',
  });

  useEffect(() => {
    const controller = new AbortController();

    getProfile()
      .then((p) => {
        setProfile(p);
        setFormData({
          displayName: p.displayName,
          email: p.email,
          username: p.username,
        });
      })
      .catch((err) => setStatus({ 
        type: 'error', 
        message: err instanceof Error ? err.message : 'Failed to load profile' 
      }))
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, []);

  // Helper to show toast notification
  const showToastNotification = (type: 'error' | 'success', message: string) => {
    setStatus({ type, message });
    setShowToast(true);
    
    // Clear existing timer
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    
    // Auto-hide after 3 seconds
    toastTimerRef.current = setTimeout(() => {
      setShowToast(false);
    }, 3000) as number;
  };
  const isDirty = useMemo(() => {
    if (!profile) return false;
    return (
      formData.displayName !== profile.displayName ||
      formData.email !== profile.email
    );
  }, [formData, profile]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      showToastNotification('error', 'File size must be less than 5MB.');
      return;
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      showToastNotification('error', 'Only image files (JPEG, JPG, PNG, GIF, WebP) are allowed.');
      return;
    }

    setUploadingAvatar(true);

    try {
      const result = await uploadAvatar(file);
      setProfile(prev => prev ? { ...prev, avatar: result.avatar } : null);
      showToastNotification('success', 'Avatar uploaded successfully.');
      onProfileUpdated?.({ ...profile!, avatar: result.avatar });
    } catch (err) {
      showToastNotification('error', err instanceof Error ? err.message : 'Failed to upload avatar.');
    } finally {
      setUploadingAvatar(false);
      // Clear the file input
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

      const updated = await updateProfile(updates);
      
      setProfile(updated);
      showToastNotification('success', 'Profile updated successfully.');
      onProfileUpdated?.(updated);
    } catch (err) {
      showToastNotification('error', err instanceof Error ? err.message : 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="profile-page"><p className="profile-muted">Loading profile…</p></div>;

  return (
    <div className="profile-page">
      <header>
        <h2 className="profile-title">Profile</h2>
        <p className="profile-desc">Update your account details and profile picture.</p>
      </header>

      <form className="profile-form" onSubmit={handleSubmit}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3rem' }}>
          {/* Left Column: Avatar */}
          <div style={{ flex: '0 0 250px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div className="form-group" style={{ width: '100%', textAlign: 'center' }}>
              <label className="profile-label" style={{ display: 'block', marginBottom: '1rem' }}>Profile Picture</label>
              <div className="profile-avatar-section" style={{ flexDirection: 'column', border: 'none', padding: 0 }}>
                <div className="profile-avatar-container" style={{ margin: '0 auto 1rem' }}>
                  <div 
                    onClick={handleAvatarClick}
                    className="profile-avatar-clickable"
                    style={{ 
                      cursor: 'pointer', 
                      position: 'relative',
                      width: '100%', 
                      height: '100%'
                    }}
                    title="Click to change avatar"
                    onMouseEnter={() => setIsAvatarHovered(true)}
                    onMouseLeave={() => setIsAvatarHovered(false)}
                  >
                    {profile?.avatar ? (
                      <img 
                        src={profile.avatar.startsWith('data:') ? profile.avatar : `data:image/jpeg;base64,${profile.avatar}`} 
                        alt="Profile avatar" 
                        className="profile-page-avatar"
                        style={{ 
                          width: '100%', 
                          height: '100%', 
                          objectFit: 'cover', 
                          borderRadius: '50%',
                          transition: 'filter 0.2s ease',
                          filter: isAvatarHovered ? 'brightness(0.7)' : 'brightness(1)'
                        }}
                        onError={(e) => {
                          // Fallback if image fails to load
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          target.nextElementSibling?.classList.remove('hidden');
                        }}
                      />
                    ) : (
                      <div 
                        className="profile-avatar-placeholder" 
                        style={{ 
                          width: '100%', 
                          height: '100%', 
                          borderRadius: '50%', 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center', 
                          background: isAvatarHovered ? '#cbd5e1' : '#e2e8f0', 
                          color: '#64748b',
                          transition: 'background 0.2s ease',
                          cursor: 'pointer'
                        }}
                      >
                        <span>No Avatar</span>
                      </div>
                    )}
                    <div 
                      className="profile-edit-overlay"
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: 'rgba(0, 0, 0, 0.5)',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: isAvatarHovered ? 1 : 0,
                        transition: 'opacity 0.2s ease',
                        pointerEvents: 'none'
                      }}
                    >
                      <Edit 
                        size={24} 
                        color="white" 
                        style={{ pointerEvents: 'none' }}
                      />
                    </div>
                    {uploadingAvatar && (
                      <div 
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          backgroundColor: 'rgba(255, 255, 255, 0.8)',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <span style={{ color: '#64748b', fontSize: '0.875rem' }}>Uploading...</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="profile-avatar-controls" style={{ width: '100%', flexDirection: 'column' }}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                    onChange={handleAvatarChange}
                    style={{ display: 'none' }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Details */}
          <div style={{ flex: '1', minWidth: '300px' }}>
            <div className="form-group">
              <label className="profile-label">Username</label>
              <input
                type="text"
                className="profile-input"
                value={formData.username}
                readOnly
                tabIndex={-1}
                style={{ 
                  userSelect: 'none', 
                  cursor: 'not-allowed',
                  WebkitUserSelect: 'none',
                  MozUserSelect: 'none',
                  msUserSelect: 'none',
                  backgroundColor: '#f8fafc',
                  color: '#64748b'
                }}
              />
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

            <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button 
                type="button"
                className="profile-info-btn"
                onClick={() => onNavigate?.('personal-details')}
                style={{ 
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.75rem 1rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  backgroundColor: '#f9fafb',
                  color: '#374151',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#f3f4f6';
                  e.currentTarget.style.borderColor = '#9ca3af';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#f9fafb';
                  e.currentTarget.style.borderColor = '#d1d5db';
                }}
              >
                <Info size={16} />
                View Personal Details
              </button>
              
              <button 
                type="submit" 
                className="profile-submit" 
                disabled={saving || !isDirty}
                style={{ minWidth: '150px' }}
              >
                {saving ? 'Saving changes...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* Toast Notification */}
      {status && (
        <div 
          className={`profile-toast ${status.type} ${showToast ? 'show' : ''}`}
          role="alert"
        >
          {status.message}
        </div>
      )}
    </div>
  );
}

import { useEffect, useState, type ReactNode } from 'react';
import { getProfile, updateProfile, getStoredToken, API_URL } from '../lib/authApi';
import { Info, Save, X } from 'lucide-react';
import type { ProfileResponse } from '../lib/authApi';
import './PersonalDetails.css';

interface PersonalDetailsProps {
  onBack: () => void;
}

interface AdditionalInfo {
  bio: string;
  secondPhone: string;
  address: string;
  emergencyContact: string;
  emergencyRelationship: string;
  emergencyPhone: string;
  bloodType: string;
  allergies: string;
  medicalConditions: string;
  skills: string;
}

interface DetailItem {
  label: string;
  value: ReactNode;
  wide?: boolean;
}

function normalizeAdditionalInfo(raw: Partial<AdditionalInfo> & { phone?: string }): AdditionalInfo {
  return {
    bio: raw.bio || '',
    secondPhone: raw.secondPhone || raw.phone || '',
    address: raw.address || '',
    emergencyContact: raw.emergencyContact || '',
    emergencyRelationship: raw.emergencyRelationship || '',
    emergencyPhone: raw.emergencyPhone || '',
    bloodType: raw.bloodType || '',
    allergies: raw.allergies || '',
    medicalConditions: raw.medicalConditions || '',
    skills: raw.skills || ''
  };
}

function compactDefined<T>(items: Array<T | null | undefined>): T[] {
  return items.filter((item): item is T => Boolean(item));
}

export default function PersonalDetails({ onBack }: PersonalDetailsProps) {
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditingAdditional, setIsEditingAdditional] = useState(false);
  const [additionalInfo, setAdditionalInfo] = useState<AdditionalInfo>(normalizeAdditionalInfo({}));
  const [savedAdditionalInfo, setSavedAdditionalInfo] = useState<AdditionalInfo | null>(null);

  useEffect(() => {
    getProfile()
      .then((p) => {
        setProfile(p);
        const normalized = normalizeAdditionalInfo(p.additionalInfo || {});
        setSavedAdditionalInfo(normalized);
        setAdditionalInfo(normalized);
      })
      .catch((err) => {
        console.error('Failed to load profile:', err);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleEditAdditional = () => {
    if (savedAdditionalInfo) {
      setAdditionalInfo(savedAdditionalInfo);
    }
    setIsEditingAdditional(true);
  };

  const handleSaveAdditional = async () => {
    let updatedUsername = profile?.username || 'unknown';
    try {
      const updatedProfile = await updateProfile({ additionalInfo });
      const normalizedSaved = normalizeAdditionalInfo(updatedProfile.additionalInfo || additionalInfo);
      updatedUsername = updatedProfile.username || updatedUsername;
      setProfile(updatedProfile);
      setSavedAdditionalInfo(normalizedSaved);
      setAdditionalInfo(normalizedSaved);
      setIsEditingAdditional(false);
    } catch (error) {
      console.error('Failed to save additional info:', error);
      return;
    }

    try {
      const token = await getStoredToken();
      if (!token) return;

      const auditData = {
        action: 'UPDATE_PERSONAL_INFO',
        resourceType: 'USER_PROFILE',
        resourceId: updatedUsername,
        resourceName: 'Personal Information',
        description: `User updated personal information: ${additionalInfo.bio ? 'Bio, ' : ''}${additionalInfo.secondPhone ? 'Second Phone Number, ' : ''}${additionalInfo.address ? 'Address, ' : ''}${additionalInfo.emergencyContact ? 'Emergency Contact, ' : ''}${additionalInfo.emergencyRelationship ? 'Relationship, ' : ''}${additionalInfo.emergencyPhone ? 'Emergency Phone, ' : ''}${additionalInfo.bloodType ? 'Blood Type, ' : ''}${additionalInfo.allergies ? 'Allergies, ' : ''}${additionalInfo.medicalConditions ? 'Medical Conditions' : ''}`,
        status: 'SUCCESS',
        severity: 'LOW'
      };

      await fetch(`${API_URL}/api/admin/audit-logs`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(auditData)
      });
    } catch (error) {
      console.error('Failed to create audit log for personal info update:', error);
    }
  };

  const handleCancelEdit = () => {
    setIsEditingAdditional(false);
    if (savedAdditionalInfo) {
      setAdditionalInfo(savedAdditionalInfo);
    } else {
      setAdditionalInfo(normalizeAdditionalInfo({}));
    }
  };

  const handleAdditionalInfoChange = (field: keyof AdditionalInfo, value: string) => {
    setAdditionalInfo((prev) => ({ ...prev, [field]: value }));
  };

  if (loading) {
    return (
      <div className="personal-details-page">
        <div className="personal-details-loading">
          <div className="spinner"></div>
          <p>Loading personal details...</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="personal-details-page">
        <div className="personal-details-error">
          <p>Failed to load profile information.</p>
        </div>
      </div>
    );
  }

  const accountTypeLabel = profile.accountType.charAt(0).toUpperCase() + profile.accountType.slice(1);
  const identityTitle = profile.displayName?.trim() || profile.username;
  const identityInitial = identityTitle.charAt(0).toUpperCase() || 'U';

  const accountInfoItems: DetailItem[] = [
    { label: 'Username', value: profile.username },
    { label: 'Display Name', value: profile.displayName?.trim() || 'Not set' },
    { label: 'Email Address', value: profile.email?.trim() || 'Not set', wide: true },
    {
      label: 'Email Verification',
      value: (
        <span className={`verification-badge ${profile.emailVerified ? 'verified' : 'unverified'}`}>
          {profile.email?.trim()
            ? (profile.emailVerified ? 'Verified' : 'Not verified')
            : 'No email'}
        </span>
      )
    },
    { label: 'Phone Number', value: profile.phone?.trim() ? profile.phone : 'Not set' },
    {
      label: 'Phone Verification',
      value: (
        <span className={`verification-badge ${profile.phoneVerified ? 'verified' : 'unverified'}`}>
          {profile.phone?.trim()
            ? (profile.phoneVerified ? 'Verified' : 'Not verified')
            : 'No phone'}
        </span>
      )
    }
  ];

  const additionalInfoItems = compactDefined<DetailItem>([
    savedAdditionalInfo?.bio ? { label: 'Bio', value: savedAdditionalInfo.bio, wide: true } : null,
    savedAdditionalInfo?.secondPhone ? { label: 'Second Phone Number', value: savedAdditionalInfo.secondPhone } : null,
    savedAdditionalInfo?.address ? { label: 'Address', value: savedAdditionalInfo.address, wide: true } : null,
    savedAdditionalInfo?.skills ? { label: 'Skills', value: savedAdditionalInfo.skills, wide: true } : null
  ]);

  const emergencyInfoItems = compactDefined<DetailItem>([
    savedAdditionalInfo?.emergencyContact ? { label: 'Contact Name', value: savedAdditionalInfo.emergencyContact } : null,
    savedAdditionalInfo?.emergencyRelationship ? { label: 'Relationship', value: savedAdditionalInfo.emergencyRelationship } : null,
    savedAdditionalInfo?.emergencyPhone ? { label: 'Emergency Phone', value: savedAdditionalInfo.emergencyPhone } : null,
    savedAdditionalInfo?.bloodType ? { label: 'Blood Type', value: savedAdditionalInfo.bloodType } : null,
    savedAdditionalInfo?.allergies ? { label: 'Allergies', value: savedAdditionalInfo.allergies, wide: true } : null,
    savedAdditionalInfo?.medicalConditions ? { label: 'Medical Conditions', value: savedAdditionalInfo.medicalConditions, wide: true } : null
  ]);

  const statusInfoItems: DetailItem[] = [
    { label: 'Account Status', value: 'Active' },
    { label: 'Account Level', value: accountTypeLabel },
    {
      label: 'Profile Completion',
      value: additionalInfoItems.length + emergencyInfoItems.length > 0 ? 'Configured' : 'Basic setup'
    }
  ];

  return (
    <div className="personal-details-page">
      <header className="personal-details-header">
        <button type="button" className="back-btn" onClick={onBack}>
          <span aria-hidden="true">←</span>
          <span>Back to Profile</span>
        </button>
        <h2 className="personal-details-title">Personal Details</h2>
        <p className="personal-details-desc">View and manage your complete account information in one workspace.</p>
      </header>

      <div className="personal-details-content">
        <div className="personal-details-card personal-overview-card">
          <div className="personal-overview-identity">
            <div className="avatar-display personal-overview-avatar">
              {profile.avatar ? (
                <img
                  src={profile.avatar.startsWith('data:') ? profile.avatar : `data:image/jpeg;base64,${profile.avatar}`}
                  alt="Profile avatar"
                  className="avatar-image"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                  }}
                />
              ) : (
                <div className="personal-overview-avatar-fallback">{identityInitial}</div>
              )}
            </div>

            <div className="personal-overview-identity-copy">
              <h3>{identityTitle}</h3>
              <p>@{profile.username}</p>
              <div className="personal-overview-pill-row">
                <span className="personal-overview-pill">{accountTypeLabel}</span>
                <span className={`verification-badge ${profile.emailVerified ? 'verified' : 'unverified'}`}>
                  {profile.emailVerified ? 'Email Verified' : 'Email Pending'}
                </span>
                <span className={`verification-badge ${profile.phoneVerified ? 'verified' : 'unverified'}`}>
                  {profile.phoneVerified ? 'Phone Verified' : 'Phone Pending'}
                </span>
              </div>
            </div>
          </div>

          <div className="personal-overview-section">
            <div className="personal-card-header">
              <div>
                <h3>Account Information</h3>
                <p>Core login and contact details for this account.</p>
              </div>
            </div>
            <div className="personal-info-grid">
              {accountInfoItems.map((item) => (
                <div key={item.label} className={`personal-info-tile${item.wide ? ' wide' : ''}`}>
                  <span className="detail-label">{item.label}</span>
                  <div className="detail-value detail-value-left">{item.value}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="personal-overview-section personal-overview-status">
            <div className="personal-card-header">
              <div>
                <h3>Account Status</h3>
                <p>Access level and readiness summary.</p>
              </div>
            </div>
            <div className="personal-status-stack">
              {statusInfoItems.map((item) => (
                <div key={item.label} className="personal-status-card">
                  <span className="detail-label">{item.label}</span>
                  <span className="detail-value detail-value-left">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="personal-details-card personal-details-span-full">
          <div className="personal-card-header personal-card-header-with-actions">
            <div>
              <h3>Additional Information</h3>
              <p>Background, daily contact details, and general profile notes.</p>
            </div>
            {!isEditingAdditional ? (
              <button type="button" className="info-btn" onClick={handleEditAdditional}>
                <Info size={16} />
                {savedAdditionalInfo ? 'Edit Info' : 'Add Info'}
              </button>
            ) : (
              <div className="personal-card-actions">
                <button type="button" className="save-btn" onClick={handleSaveAdditional}>
                  <Save size={16} />
                  Save
                </button>
                <button type="button" className="cancel-btn" onClick={handleCancelEdit}>
                  <X size={16} />
                  Cancel
                </button>
              </div>
            )}
          </div>

          {isEditingAdditional ? (
            <div className="additional-info-form">
              <div className="personal-form-row">
                <div className="personal-form-group">
                  <label>Bio</label>
                  <textarea
                    value={additionalInfo.bio}
                    onChange={(e) => handleAdditionalInfoChange('bio', e.target.value)}
                    placeholder="Tell us about yourself..."
                    rows={3}
                  />
                </div>
              </div>

              <div className="personal-form-row personal-form-row-split">
                <div className="personal-form-group personal-form-group-split">
                  <label>Second Phone Number</label>
                  <input
                    type="tel"
                    value={additionalInfo.secondPhone}
                    onChange={(e) => handleAdditionalInfoChange('secondPhone', e.target.value)}
                    placeholder="+(63)"
                  />
                </div>
                <div className="personal-form-group personal-form-group-split">
                  <label>Skills</label>
                  <input
                    type="text"
                    value={additionalInfo.skills}
                    onChange={(e) => handleAdditionalInfoChange('skills', e.target.value)}
                    placeholder="e.g., JavaScript, Project Management, Communication"
                  />
                </div>
              </div>

              <div className="personal-form-row">
                <div className="personal-form-group">
                  <label>Address</label>
                  <input
                    type="text"
                    value={additionalInfo.address}
                    onChange={(e) => handleAdditionalInfoChange('address', e.target.value)}
                    placeholder="123 Main St, City, State 12345"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="additional-info-display personal-info-grid">
              {additionalInfoItems.map((item) => (
                <div key={item.label} className={`personal-info-tile${item.wide ? ' wide' : ''}`}>
                  <span className="detail-label">{item.label}</span>
                  <div className="detail-value detail-value-left">{item.value}</div>
                </div>
              ))}
              {additionalInfoItems.length === 0 && (
                <div className="personal-empty-state">
                  No additional information provided yet. Click "Add Info" to get started.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="personal-details-card personal-details-span-full">
          <div className="personal-card-header">
            <div>
              <h3>Emergency Contact</h3>
              <p>Emergency support information and basic medical notes.</p>
            </div>
          </div>

          {isEditingAdditional ? (
            <div>
              <div className="personal-form-row personal-form-row-split">
                <div className="personal-form-group personal-form-group-split">
                  <label>Contact Name</label>
                  <input
                    type="text"
                    value={additionalInfo.emergencyContact}
                    onChange={(e) => handleAdditionalInfoChange('emergencyContact', e.target.value)}
                    placeholder="Full name"
                  />
                </div>
                <div className="personal-form-group personal-form-group-split">
                  <label>Relationship</label>
                  <input
                    type="text"
                    value={additionalInfo.emergencyRelationship}
                    onChange={(e) => handleAdditionalInfoChange('emergencyRelationship', e.target.value)}
                    placeholder="e.g., Spouse, Parent, Friend"
                  />
                </div>
              </div>

              <div className="personal-form-row">
                <div className="personal-form-group">
                  <label>Emergency Phone</label>
                  <input
                    type="tel"
                    value={additionalInfo.emergencyPhone}
                    onChange={(e) => handleAdditionalInfoChange('emergencyPhone', e.target.value)}
                    placeholder="+(63)"
                  />
                </div>
              </div>

              <div className="personal-form-row personal-form-row-split">
                <div className="personal-form-group personal-form-group-split">
                  <label>Blood Type</label>
                  <input
                    type="text"
                    value={additionalInfo.bloodType}
                    onChange={(e) => handleAdditionalInfoChange('bloodType', e.target.value)}
                    placeholder="e.g., O+, A-, B+"
                  />
                </div>
                <div className="personal-form-group personal-form-group-split">
                  <label>Allergies</label>
                  <input
                    type="text"
                    value={additionalInfo.allergies}
                    onChange={(e) => handleAdditionalInfoChange('allergies', e.target.value)}
                    placeholder="e.g., Peanuts, Shellfish, Penicillin"
                  />
                </div>
              </div>

              <div className="personal-form-row">
                <div className="personal-form-group">
                  <label>Medical Conditions</label>
                  <textarea
                    value={additionalInfo.medicalConditions}
                    onChange={(e) => handleAdditionalInfoChange('medicalConditions', e.target.value)}
                    placeholder="e.g., Asthma, Diabetes, Heart condition"
                    rows={2}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="additional-info-display personal-info-grid">
              {emergencyInfoItems.map((item) => (
                <div key={item.label} className={`personal-info-tile${item.wide ? ' wide' : ''}`}>
                  <span className="detail-label">{item.label}</span>
                  <div className="detail-value detail-value-left">{item.value}</div>
                </div>
              ))}
              {emergencyInfoItems.length === 0 && (
                <div className="personal-empty-state">
                  No emergency information provided.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

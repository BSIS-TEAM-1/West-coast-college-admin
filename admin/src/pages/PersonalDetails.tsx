import { useState, useEffect } from 'react';
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

export default function PersonalDetails({ onBack }: PersonalDetailsProps) {
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditingAdditional, setIsEditingAdditional] = useState(false);
  const [additionalInfo, setAdditionalInfo] = useState<AdditionalInfo>(normalizeAdditionalInfo({}));
  const [savedAdditionalInfo, setSavedAdditionalInfo] = useState<AdditionalInfo | null>(null);

  useEffect(() => {
    const controller = new AbortController();

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

    return () => controller.abort();
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

    // Create audit log for personal information update
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
    setAdditionalInfo(prev => ({ ...prev, [field]: value }));
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

  return (
    <div className="personal-details-page">
      <header className="personal-details-header">
        <button className="back-btn" onClick={onBack}>
          ← Back to Profile
        </button>
        <h2 className="personal-details-title">Personal Details</h2>
        <p className="personal-details-desc">View your complete account information</p>
      </header>

      <div className="personal-details-content">
        {profile.avatar && (
          <div className="personal-details-card">
            <h3>Profile Picture</h3>
            <div className="avatar-display">
              <img 
                src={profile.avatar.startsWith('data:') ? profile.avatar : `data:image/jpeg;base64,${profile.avatar}`}
                alt="Profile avatar" 
                className="avatar-image"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                }}
              />
            </div>
          </div>
        )}

        <div className="personal-details-card">
          <h3>Account Information</h3>
          <div className="detail-row">
            <span className="detail-label">Username:</span>
            <span className="detail-value">{profile.username}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Display Name:</span>
            <span className="detail-value">{profile.displayName}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Email Address:</span>
            <span className="detail-value">{profile.email}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Phone Number:</span>
            <span className="detail-value">{profile.phone?.trim() ? profile.phone : 'Not set'}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Phone Verification:</span>
            <span className="detail-value">
              <span className={`verification-badge ${profile.phoneVerified ? 'verified' : 'unverified'}`}>
                {profile.phone?.trim()
                  ? (profile.phoneVerified ? 'Verified' : 'Not verified')
                  : 'No phone'}
              </span>
            </span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Account Type:</span>
            <span className="detail-value">{profile.accountType}</span>
          </div>
        </div>

        <div className="personal-details-card">
          <h3>Account Status</h3>
          <div className="detail-row">
            <span className="detail-label">Account Status:</span>
            <span className="detail-value">Active</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Account Level:</span>
            <span className="detail-value">{profile.accountType.charAt(0).toUpperCase() + profile.accountType.slice(1)}</span>
          </div>
        </div>

        <div className="personal-details-card" style={{ gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3>Additional Information</h3>
            {!isEditingAdditional ? (
              <button 
                className="info-btn"
                onClick={handleEditAdditional}
              >
                <Info size={16} />
                {savedAdditionalInfo ? 'Edit Info' : 'Add Info'}
              </button>
            ) : (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button 
                  className="save-btn"
                  onClick={handleSaveAdditional}
                >
                  <Save size={16} />
                  Save
                </button>
                <button 
                  className="cancel-btn"
                  onClick={handleCancelEdit}
                >
                  <X size={16} />
                  Cancel
                </button>
              </div>
            )}
          </div>

          {isEditingAdditional ? (
            <div className="additional-info-form">
              <div className="form-row">
                <div className="form-group">
                  <label>Bio</label>
                  <textarea
                    value={additionalInfo.bio}
                    onChange={(e) => handleAdditionalInfoChange('bio', e.target.value)}
                    placeholder="Tell us about yourself..."
                    rows={3}
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Second Phone Number</label>
                  <input
                    type="tel"
                    value={additionalInfo.secondPhone}
                    onChange={(e) => handleAdditionalInfoChange('secondPhone', e.target.value)}
                    placeholder="+(63)"
                  />
                </div>
              </div>
                            <div className="form-row">
                <div className="form-group">
                  <label>Address</label>
                  <input
                    type="text"
                    value={additionalInfo.address}
                    onChange={(e) => handleAdditionalInfoChange('address', e.target.value)}
                    placeholder="123 Main St, City, State 12345"
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Skills</label>
                  <input
                    type="text"
                    value={additionalInfo.skills}
                    onChange={(e) => handleAdditionalInfoChange('skills', e.target.value)}
                    placeholder="e.g., JavaScript, Project Management, Communication"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="additional-info-display">
              {savedAdditionalInfo?.bio && (
                <div className="detail-row">
                  <span className="detail-label">Bio:</span>
                  <span className="detail-value">{savedAdditionalInfo.bio}</span>
                </div>
              )}
              {savedAdditionalInfo?.secondPhone && (
                <div className="detail-row">
                  <span className="detail-label">Second Phone Number:</span>
                  <span className="detail-value">{savedAdditionalInfo.secondPhone}</span>
                </div>
              )}
              {savedAdditionalInfo?.address && (
                <div className="detail-row">
                  <span className="detail-label">Address:</span>
                  <span className="detail-value">{savedAdditionalInfo.address}</span>
                </div>
              )}
                            {savedAdditionalInfo?.skills && (
                <div className="detail-row">
                  <span className="detail-label">Skills:</span>
                  <span className="detail-value">{savedAdditionalInfo.skills}</span>
                </div>
              )}
              {(!savedAdditionalInfo || (!savedAdditionalInfo.bio && !savedAdditionalInfo.secondPhone && !savedAdditionalInfo.address && 
                !savedAdditionalInfo.emergencyContact && !savedAdditionalInfo.skills)) && (
                <div style={{ textAlign: 'center', color: '#64748b', fontStyle: 'italic' }}>
                  No additional information provided yet. Click "Add Info" to get started.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Emergency Contact Card */}
        <div className="personal-details-card" style={{ gridColumn: '1 / -1' }}>
          <h3>Emergency Contact</h3>
          {isEditingAdditional ? (
            <div>
              <div className="form-row" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <div className="form-group" style={{ flex: 1, minWidth: '250px' }}>
                  <label>Contact Name</label>
                  <input
                    type="text"
                    value={additionalInfo.emergencyContact}
                    onChange={(e) => handleAdditionalInfoChange('emergencyContact', e.target.value)}
                    placeholder="Full name"
                  />
                </div>
                <div className="form-group" style={{ flex: 1, minWidth: '250px' }}>
                  <label>Relationship</label>
                  <input
                    type="text"
                    value={additionalInfo.emergencyRelationship}
                    onChange={(e) => handleAdditionalInfoChange('emergencyRelationship', e.target.value)}
                    placeholder="e.g., Spouse, Parent, Friend"
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Emergency Phone</label>
                  <input
                    type="tel"
                    value={additionalInfo.emergencyPhone}
                    onChange={(e) => handleAdditionalInfoChange('emergencyPhone', e.target.value)}
                    placeholder="+(63)"
                  />
                </div>
              </div>
              <div className="form-row" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <div className="form-group" style={{ flex: 1, minWidth: '250px' }}>
                  <label>Blood Type</label>
                  <input
                    type="text"
                    value={additionalInfo.bloodType}
                    onChange={(e) => handleAdditionalInfoChange('bloodType', e.target.value)}
                    placeholder="e.g., O+, A-, B+"
                  />
                </div>
                <div className="form-group" style={{ flex: 1, minWidth: '250px' }}>
                  <label>Allergies</label>
                  <input
                    type="text"
                    value={additionalInfo.allergies}
                    onChange={(e) => handleAdditionalInfoChange('allergies', e.target.value)}
                    placeholder="e.g., Peanuts, Shellfish, Penicillin"
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
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
            <div className="additional-info-display">
              {savedAdditionalInfo?.emergencyContact && (
                <div className="detail-row">
                  <span className="detail-label">Contact Name:</span>
                  <span className="detail-value">{savedAdditionalInfo.emergencyContact}</span>
                </div>
              )}
              {savedAdditionalInfo?.emergencyRelationship && (
                <div className="detail-row">
                  <span className="detail-label">Relationship:</span>
                  <span className="detail-value">{savedAdditionalInfo.emergencyRelationship}</span>
                </div>
              )}
              {savedAdditionalInfo?.emergencyPhone && (
                <div className="detail-row">
                  <span className="detail-label">Emergency Phone:</span>
                  <span className="detail-value">{savedAdditionalInfo.emergencyPhone}</span>
                </div>
              )}
              {savedAdditionalInfo?.bloodType && (
                <div className="detail-row">
                  <span className="detail-label">Blood Type:</span>
                  <span className="detail-value">{savedAdditionalInfo.bloodType}</span>
                </div>
              )}
              {savedAdditionalInfo?.allergies && (
                <div className="detail-row">
                  <span className="detail-label">Allergies:</span>
                  <span className="detail-value">{savedAdditionalInfo.allergies}</span>
                </div>
              )}
              {savedAdditionalInfo?.medicalConditions && (
                <div className="detail-row">
                  <span className="detail-label">Medical Conditions:</span>
                  <span className="detail-value">{savedAdditionalInfo.medicalConditions}</span>
                </div>
              )}
              {(!savedAdditionalInfo?.emergencyContact && !savedAdditionalInfo?.emergencyRelationship && 
                !savedAdditionalInfo?.emergencyPhone && !savedAdditionalInfo?.bloodType && 
                !savedAdditionalInfo?.allergies && !savedAdditionalInfo?.medicalConditions) && (
                <div style={{ textAlign: 'center', color: '#64748b', fontStyle: 'italic' }}>
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

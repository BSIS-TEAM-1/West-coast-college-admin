import { LayoutDashboard, User, UserPlus, Settings, Users, Bell, FileText, Shield, Activity, CheckCircle2, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { getProfile } from '../lib/authApi';
import type { ProfileResponse } from '../lib/authApi';
import './Sidebar.css';

type View = 'dashboard' | 'profile' | 'add-account' | 'account-logs'| 'settings' | 'announcements' | 'audit-logs' | 'documents' | 'announcement-detail' | 'personal-details' | 'system-health' | 'security' | 'cor-docs';

type SidebarProps = {
  activeLink?: View;
  onNavigate?: (view: View) => void;
  profileUpdateTrigger?: number; // Add this to trigger re-fetch
  isOpen?: boolean;
  onClose?: () => void;
};

const NAV_ITEMS: { id: View; label: string; icon: any }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'system-health', label: 'System Health', icon: Activity },
  { id: 'announcements', label: 'Manage Announcements', icon: Bell },
  { id: 'documents', label: 'Document Management', icon: FileText },
  { id: 'cor-docs', label: 'COR Generation', icon: CheckCircle2 },
  { id: 'add-account', label: 'Add Account', icon: UserPlus },
  { id: 'audit-logs', label: 'System Audit Logs', icon: Shield },
  { id: 'account-logs', label: 'Staff Registration Logs', icon: Users },
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function Sidebar({ activeLink = 'dashboard', onNavigate, profileUpdateTrigger, isOpen = false, onClose }: SidebarProps) {
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const controller = new AbortController();
    
    getProfile()
      .then(setProfile)
      .catch(() => {
        // Fallback handled in JSX
      });

    return () => controller.abort();
  }, [profileUpdateTrigger]); // Re-fetch when trigger changes

  // Update time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <aside className={`sidebar ${isOpen ? 'sidebar-open' : ''}`}>
      <div className="sidebar-brand">
        <div className="brand-content">
          <div className="logo-container">
            <img 
              src="/Logo.jpg" 
              alt="West Coast College Logo" 
              className="sidebar-logo"
              onError={(e) => {
                // Fallback to text if logo fails to load
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                const fallback = target.nextElementSibling as HTMLElement;
                if (fallback) fallback.style.display = 'block';
              }}
            />
            {/* Fallback text logo */}
            <div className="logo-fallback-text" style={{ display: 'none' }}>
              WCC
            </div>
          </div>
          <div className="brand-text">
            <span className="sidebar-title">West Coast College</span>
            <span className="sidebar-tagline">Admin Portal</span>
          </div>
          <button
            type="button"
            className="sidebar-close-btn"
            onClick={onClose}
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="Admin navigation">
        {NAV_ITEMS.filter(({ id }) => {
          // Hide announcements for registrar users
          if (id === 'announcements' && profile?.accountType === 'registrar') {
            return false
          }
          // Hide system-health for professor users
          if (id === 'system-health' && profile?.accountType === 'professor') {
            return false
          }
          return true
        }).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={`sidebar-link ${activeLink === id ? 'sidebar-link-active' : ''}`}
            onClick={() => {
              onNavigate?.(id)
              onClose?.()
            }}
            aria-current={activeLink === id ? 'page' : undefined}
          >
            <Icon size={18} className="sidebar-icon" />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {/* Time Display */}
      <div className="sidebar-time" style={{
        padding: '1rem',
        margin: '0 1rem',
        background: 'rgba(59, 130, 246, 0.1)',
        borderRadius: '8px',
        textAlign: 'center',
        border: '1px solid rgba(59, 130, 246, 0.2)'
      }}>
        <div style={{
          fontSize: '0.75rem',
          color: 'var(--text-secondary)',
          fontWeight: '500',
          marginBottom: '0.25rem'
        }}>
          Current Time
        </div>
        <div style={{
          fontSize: '1rem',
          fontWeight: '600',
          color: 'var(--text-primary)'
        }}>
          {currentTime.toLocaleTimeString()}
        </div>
        <div style={{
          fontSize: '0.75rem',
          color: 'var(--text-secondary)',
          marginTop: '0.25rem'
        }}>
          {currentTime.toLocaleDateString()}
        </div>
      </div>

      <div className="sidebar-footer">
        <div className="profile-section">
          <div className="profile-avatar">
            {profile?.avatar ? (
              <img 
                src={profile.avatar.startsWith('data:') ? profile.avatar : `data:image/jpeg;base64,${profile.avatar}`} 
                alt="Profile" 
                className="profile-avatar-img"
                onError={(e) => {
                  // Fallback if image fails to load
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  target.nextElementSibling?.classList.remove('hidden');
                }}
              />
            ) : (
              <div className="profile-avatar-placeholder">
                <User size={16} />
              </div>
            )}
            {/* Fallback placeholder */}
            <div className="profile-avatar-placeholder hidden" style={{ display: 'none' }}>
              <User size={16} />
            </div>
          </div>
          <div className="profile-info">
            <div className="profile-name">
              {profile?.displayName || profile?.username || 'Admin User'}
            </div>
            <div className="profile-role">{profile?.accountType === 'registrar' ? 'Registrar' : 'Administrator'}</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

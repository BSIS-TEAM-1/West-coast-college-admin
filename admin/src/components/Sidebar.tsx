import { LayoutDashboard, User, UserPlus, Settings, Users, Bell, Shield, Activity, CheckCircle2, BookOpen, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { getProfile } from '../lib/authApi';
import type { ProfileResponse } from '../lib/authApi';
import './Sidebar.css';

type View = 'dashboard' | 'profile' | 'add-account' | 'account-logs'| 'settings' | 'announcements' | 'audit-logs' | 'announcement-detail' | 'personal-details' | 'system-health' | 'security' | 'cor-docs' | 'calendar' | 'curriculum-management';

type SidebarProps = {
  id?: string;
  activeLink?: View;
  onNavigate?: (view: View) => void;
  profileUpdateTrigger?: number; // Add this to trigger re-fetch
  isOpen?: boolean;
  onClose?: () => void;
  initialProfile?: ProfileResponse | null;
};

const NAV_ITEMS: { id: View; label: string; icon: any }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'system-health', label: 'System Health', icon: Activity },
  { id: 'announcements', label: 'Announcements', icon: Bell },
  { id: 'curriculum-management', label: 'Curriculum Management', icon: BookOpen },
  { id: 'cor-docs', label: 'COR Generation', icon: CheckCircle2 },
  { id: 'add-account', label: 'Add Account', icon: UserPlus },
  { id: 'audit-logs', label: 'System Audit Logs', icon: Shield },
  { id: 'account-logs', label: 'Staff Registration Logs', icon: Users },
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function Sidebar({ id, activeLink = 'dashboard', onNavigate, profileUpdateTrigger, isOpen = false, onClose, initialProfile = null }: SidebarProps) {
  const [profile, setProfile] = useState<ProfileResponse | null>(initialProfile);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    if (initialProfile) {
      setProfile(initialProfile);
      return;
    }
    
    getProfile()
      .then(setProfile)
      .catch(() => {
        // Fallback handled in JSX
      });
  }, [profileUpdateTrigger, initialProfile]); // Re-fetch when trigger changes

  // Update time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <aside
      id={id}
      className={`sidebar ${isOpen ? 'sidebar-open' : ''}`}
      aria-label="Admin navigation menu"
    >
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

      <div className="sidebar-nav-label">Menu</div>
      <nav className="sidebar-nav" aria-label="Admin navigation">
        {NAV_ITEMS.filter(({ id }) => {
          const accountType = profile?.accountType;
          // Academic pages — only visible to registrars
          const academicPages: View[] = ['curriculum-management', 'cor-docs'];
          if (academicPages.includes(id) && accountType !== 'registrar') {
            return false;
          }
          // Hide announcements for registrar users
          if (id === 'announcements' && accountType === 'registrar') {
            return false
          }
          // Hide system-health for professor users
          if (id === 'system-health' && accountType === 'professor') {
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
      <div className="sidebar-time">
        <div className="sidebar-time-label">
          Current Time
        </div>
        <div className="sidebar-time-value">
          {currentTime.toLocaleTimeString()}
        </div>
        <div className="sidebar-time-date">
          {currentTime.toLocaleDateString()}
        </div>
      </div>

    </aside>
  );
}

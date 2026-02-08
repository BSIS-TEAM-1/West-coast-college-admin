import { useState } from 'react'
import Sidebar from '../components/Sidebar'
import Navbar from '../components/Navbar'
import Profile from './Profile'
import Settings from './Settings'
import AddAccount from './AddAccount'
import AccountLogs from './AccountLogs'
import type { ProfileResponse } from '../lib/authApi'
import './Dashboard.css'

type DashboardProps = {
  username: string
  onLogout: () => void
  onProfileUpdated?: (profile: ProfileResponse) => void
}

export default function Dashboard({ username, onLogout, onProfileUpdated }: DashboardProps) {
  const [view, setView] = useState<'dashboard' | 'profile' | 'settings' | 'add-account' | 'account-logs'>('dashboard')
  const [profileUpdateTrigger, setProfileUpdateTrigger] = useState(0)

  const handleProfileUpdated = (profile: ProfileResponse) => {
    setProfileUpdateTrigger(prev => prev + 1) // Trigger sidebar re-fetch
    onProfileUpdated?.(profile)
  }

  return (
    <div className="dashboard">
      <Sidebar activeLink={view} onNavigate={setView} profileUpdateTrigger={profileUpdateTrigger} />
      <div className="dashboard-body">
        <Navbar username={username} onLogout={onLogout} />
        <main className="dashboard-main">
          {view === 'profile' ? (
            <Profile onProfileUpdated={handleProfileUpdated} />
          ) : view === 'settings' ? (
            <Settings onProfileUpdated={handleProfileUpdated} onLogout={onLogout} />
          ) : view === 'add-account' ? (
            <AddAccount />
          ) : view === 'account-logs' ? (
            <AccountLogs />
          ) : (
            <p className="dashboard-welcome">Signed in as administrator. Add admin features here.</p>
          )}
        </main>
      </div>
    </div>
  )
}

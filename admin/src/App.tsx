import { useState, useCallback, useEffect } from 'react'
import { login as apiLogin, getStoredToken, setStoredToken, clearStoredToken, getProfile, logout } from './lib/authApi'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import RegistrarDashboard from './pages/RegistrarDashboard'
import ProfessorDashboard from './pages/ProfessorDashboard.tsx'
import './App.css'
import type { ProfileResponse } from './lib/authApi'

function App() {
  const [user, setUser] = useState<{ username: string; accountType: string } | null>(null)
  const [loginError, setLoginError] = useState<string | undefined>(undefined)
  const [loginLoading, setLoginLoading] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)

  useEffect(() => {
    if (user || authChecked) return
    const token = getStoredToken()
    if (!token) {
      setAuthChecked(true)
      return
    }
    getProfile()
      .then((profile) => {
        setUser({ username: profile.username, accountType: profile.accountType })
      })
      .catch(() => {
        clearStoredToken()
      })
      .finally(() => setAuthChecked(true))
  }, [user, authChecked])

  const handleLogin = useCallback(async (username: string, password: string) => {
    console.log('=== LOGIN HANDLER DEBUG ===');
    console.log('Starting login process');
    console.log('Username:', username);
    
    setLoginError(undefined)
    setLoginLoading(true)
    try {
      console.log('Calling apiLogin...');
      const data = await apiLogin(username, password)
      console.log('Login successful, received data:', data);
      console.log('Token from login:', data.token);
      
      setStoredToken(data.token)
      console.log('Token stored, calling getProfile...');
      
      // Always fetch profile to get accurate account type
      const profile = await getProfile()
      console.log('Profile received:', profile);
      
      setUser({ username: data.username, accountType: profile.accountType })
      console.log('User state updated');
    } catch (err) {
      console.error('Login error:', err);
      setLoginError(err instanceof Error ? err.message : 'Invalid username or password.')
    } finally {
      setLoginLoading(false)
      console.log('Login process completed');
    }
  }, [])

  const handleLogout = useCallback(async () => {
    try {
      await logout()
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      setUser(null)
      setLoginError(undefined)
    }
  }, [])

  const handleProfileUpdated = useCallback((profile: ProfileResponse) => {
    setUser(prev => prev ? { ...prev, username: profile.username, accountType: profile.accountType } : null)
  }, [])

  if (user) {
    // Show different dashboard based on account type
    if (user.accountType === 'registrar') {
      return (
        <RegistrarDashboard
          username={user.username}
          onLogout={handleLogout}
          onProfileUpdated={handleProfileUpdated}
        />
      )
    }
    if (user.accountType === 'professor') {
      return (
        <ProfessorDashboard
          username={user.username}
          onLogout={handleLogout}
          onProfileUpdated={handleProfileUpdated}
        />
      )
    }
    return (
      <Dashboard
        username={user.username}
        onLogout={handleLogout}
        onProfileUpdated={handleProfileUpdated}
      />
    )
  }

  // Show loading spinner while checking auth state to prevent login flash
  if (!authChecked) {
    return (
      <div className="app-loading">
        <div className="spinner"></div>
      </div>
    )
  }

  // Show appropriate login page
  return (
    <Login
      onLogin={handleLogin}
      error={loginError}
      loading={loginLoading}
    />
  )
}

export default App

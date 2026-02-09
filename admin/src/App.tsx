import { useState, useCallback, useEffect } from 'react'
import { login as apiLogin, getStoredToken, setStoredToken, clearStoredToken, getProfile } from './lib/authApi'
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
    setLoginError(undefined)
    setLoginLoading(true)
    try {
      const data = await apiLogin(username, password)
      setStoredToken(data.token)
      // Always fetch profile to get accurate account type
      const profile = await getProfile()
      console.log('Login response:', data)
      console.log('Profile data:', profile)
      console.log('Account type being set:', profile.accountType)
      setUser({ username: data.username, accountType: profile.accountType })
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Invalid username or password.')
    } finally {
      setLoginLoading(false)
    }
  }, [])

  const handleLogout = useCallback(() => {
    clearStoredToken()
    setUser(null)
    setLoginError(undefined)
  }, [])

  const handleProfileUpdated = useCallback((profile: ProfileResponse) => {
    setUser(prev => prev ? { ...prev, username: profile.username, accountType: profile.accountType } : null)
  }, [])

  if (user) {
    // Show different dashboard based on account type
    console.log('Current user state:', user)
    console.log('Account type check:', user.accountType, '=== registrar?', user.accountType === 'registrar')
    if (user.accountType === 'registrar') {
      console.log('Rendering RegistrarDashboard')
      return (
        <RegistrarDashboard
          username={user.username}
          onLogout={handleLogout}
          onProfileUpdated={handleProfileUpdated}
        />
      )
    }
    if (user.accountType === 'professor') {
      console.log('Rendering ProfessorDashboard')
      return (
        <ProfessorDashboard
          username={user.username}
          onLogout={handleLogout}
          onProfileUpdated={handleProfileUpdated}
        />
      )
    }
    console.log('Rendering Admin Dashboard')
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

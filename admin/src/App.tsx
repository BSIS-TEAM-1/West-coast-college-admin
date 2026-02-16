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
    const checkAuth = async () => {
      try {
        const token = await getStoredToken()
        if (!token) {
          setAuthChecked(true)
          return
        }
        const profile = await getProfile()
        setUser({ username: profile.username, accountType: profile.accountType })
      } catch (error) {
        await clearStoredToken()
      } finally {
        setAuthChecked(true)
      }
    }
    checkAuth()
  }, [user, authChecked])

  const handleLogin = useCallback(async (username: string, password: string, captchaToken: string) => {
    setLoginError(undefined)
    setLoginLoading(true)
    try {
      const data = await apiLogin(username, password, captchaToken)
      
      setStoredToken(data.token)
      
      // Always fetch profile to get accurate account type
      const profile = await getProfile()
      
      setUser({ username: data.username, accountType: profile.accountType })
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Invalid username or password.')
    } finally {
      setLoginLoading(false)
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
        <div className="app-loading-spinner" aria-label="Loading"></div>
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

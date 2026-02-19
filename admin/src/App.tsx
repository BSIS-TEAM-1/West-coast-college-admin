import { useState, useCallback, useEffect } from 'react'
import {
  login as apiLogin,
  setStoredToken,
  getStoredToken,
  clearStoredToken,
  getProfile,
  logout
} from './lib/authApi'
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

  useEffect(() => {
    let mounted = true

    const restoreSession = async () => {
      const token = await getStoredToken()
      if (!token) return

      setLoginLoading(true)
      setLoginError(undefined)

      try {
        const profile = await getProfile()
        if (!mounted) return
        setUser({ username: profile.username, accountType: profile.accountType })
      } catch {
        await clearStoredToken()
      } finally {
        if (mounted) {
          setLoginLoading(false)
        }
      }
    }

    void restoreSession()
    return () => {
      mounted = false
    }
  }, [])

  const handleLogin = useCallback(async (username: string, password: string, captchaToken?: string) => {
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

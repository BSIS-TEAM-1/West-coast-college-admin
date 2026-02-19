import { useState, useCallback, useEffect } from 'react'
import { login as apiLogin, setStoredToken, getProfile, logout } from './lib/authApi'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import RegistrarDashboard from './pages/RegistrarDashboard'
import ProfessorDashboard from './pages/ProfessorDashboard.tsx'
import './App.css'
import type { ProfileResponse } from './lib/authApi'

const isAuthDebugEnabled = (): boolean => {
  const envFlag = String(import.meta.env.VITE_AUTH_DEBUG || '').toLowerCase() === 'true'
  if (import.meta.env.DEV || envFlag) return true

  try {
    return window.localStorage.getItem('auth_debug') === '1'
  } catch {
    return false
  }
}

const debugAuth = (message: string, context?: Record<string, unknown>) => {
  if (!isAuthDebugEnabled()) return

  if (context) {
    console.log('[AUTH_DEBUG]', message, context)
    return
  }

  console.log('[AUTH_DEBUG]', message)
}

function App() {
  const [user, setUser] = useState<{ username: string; accountType: string } | null>(null)
  const [loginError, setLoginError] = useState<string | undefined>(undefined)
  const [loginLoading, setLoginLoading] = useState(false)

  useEffect(() => {
    debugAuth('app-mounted', {
      tokenPresent: Boolean(window.localStorage.getItem('auth_token')),
      deviceIdPresent: Boolean(window.localStorage.getItem('client_device_id'))
    })
  }, [])

  const handleLogin = useCallback(async (username: string, password: string, captchaToken?: string) => {
    setLoginError(undefined)
    setLoginLoading(true)
    debugAuth('handleLogin:start', {
      usernameLength: username.length,
      passwordLength: password.length,
      captchaTokenPresent: Boolean(captchaToken),
      captchaTokenLength: captchaToken ? captchaToken.length : 0
    })

    try {
      const data = await apiLogin(username, password, captchaToken)
      
      setStoredToken(data.token)
      
      // Always fetch profile to get accurate account type
      const profile = await getProfile()
      
      setUser({ username: data.username, accountType: profile.accountType })
      debugAuth('handleLogin:success', {
        username: data.username,
        accountType: profile.accountType,
        tokenStored: true
      })
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Invalid username or password.')
      debugAuth('handleLogin:error', {
        message: err instanceof Error ? err.message : 'Unknown login error'
      })
    } finally {
      setLoginLoading(false)
    }
  }, [])

  const handleLogout = useCallback(async () => {
    debugAuth('handleLogout:start')
    try {
      await logout()
    } catch (error) {
      console.error('Logout error:', error)
      debugAuth('handleLogout:error', {
        message: error instanceof Error ? error.message : String(error)
      })
    } finally {
      setUser(null)
      setLoginError(undefined)
      debugAuth('handleLogout:done')
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

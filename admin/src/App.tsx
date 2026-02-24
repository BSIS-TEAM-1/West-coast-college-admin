import { useState, useCallback, useEffect } from 'react'
import {
  login as apiLogin,
  setStoredToken,
  getStoredToken,
  clearStoredToken,
  getProfile,
  logout
} from './lib/authApi'
import { applyThemePreference, getStoredTheme, setActiveThemeScope } from './lib/theme'
import Login from './pages/Login'
import LandingPage from './pages/LandingPage'
import AboutPage from './pages/AboutPage'
import TermsPolicyPage from './pages/TermsPolicyPage'
import CookiePolicyPage from './pages/CookiePolicyPage'
import CookieSystemPage from './pages/CookieSystemPage'
import Dashboard from './pages/Dashboard'
import RegistrarDashboard from './pages/RegistrarDashboard'
import ProfessorDashboard from './pages/ProfessorDashboard.tsx'
import './App.css'
import type { ProfileResponse } from './lib/authApi'

const isAuthSessionError = (message: string): boolean => {
  const normalized = String(message || '').toLowerCase()
  return (
    normalized.includes('invalid or expired token') ||
    normalized.includes('unauthorized') ||
    normalized.includes('authentication failed') ||
    normalized.includes('session was ended') ||
    normalized.includes('session revoked') ||
    normalized.includes('ip address is blocked')
  )
}

function App() {
  const [user, setUser] = useState<{ username: string; accountType: string } | null>(null)
  const [showStaffLogin, setShowStaffLogin] = useState(false)
  const [showAboutPage, setShowAboutPage] = useState(false)
  const [showTermsPolicyPage, setShowTermsPolicyPage] = useState(false)
  const [showCookiePolicyPage, setShowCookiePolicyPage] = useState(false)
  const [showCookieSystemPage, setShowCookieSystemPage] = useState(false)
  const [loginError, setLoginError] = useState<string | undefined>(undefined)
  const [loginLoading, setLoginLoading] = useState(false)
  const [sessionBootstrapping, setSessionBootstrapping] = useState(true)

  useEffect(() => {
    let mounted = true

    const restoreSession = async () => {
      const token = await getStoredToken()
      if (!token) {
        if (mounted) setSessionBootstrapping(false)
        return
      }

      setLoginLoading(true)
      setLoginError(undefined)

      try {
        const profile = await getProfile()
        if (!mounted) return

        setActiveThemeScope(profile.username)
        applyThemePreference(getStoredTheme(profile.username), { persist: false })
        setUser({ username: profile.username, accountType: profile.accountType })
      } catch (error) {
        await clearStoredToken()
        if (!mounted) return

        setActiveThemeScope(null)
        applyThemePreference(getStoredTheme(null), { persist: false })
        const message = error instanceof Error ? error.message : 'Your session has ended. Please sign in again.'
        if (isAuthSessionError(message)) {
          setLoginError(message)
          setShowStaffLogin(false)
          setShowAboutPage(false)
          setShowTermsPolicyPage(false)
          setShowCookiePolicyPage(false)
          setShowCookieSystemPage(false)
        }
      } finally {
        if (mounted) {
          setLoginLoading(false)
          setSessionBootstrapping(false)
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

      setActiveThemeScope(profile.username)
      applyThemePreference(getStoredTheme(profile.username), { persist: false })
      
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
      setActiveThemeScope(null)
      applyThemePreference(getStoredTheme(null), { persist: false })
      setUser(null)
      setShowStaffLogin(false)
      setShowAboutPage(false)
      setShowTermsPolicyPage(false)
      setShowCookiePolicyPage(false)
      setShowCookieSystemPage(false)
      setLoginError(undefined)
    }
  }, [])

  const handleProfileUpdated = useCallback((profile: ProfileResponse) => {
    setActiveThemeScope(profile.username)
    setUser(prev => prev ? { ...prev, username: profile.username, accountType: profile.accountType } : null)
  }, [])

  useEffect(() => {
    if (!user) return

    let cancelled = false
    const intervalId = window.setInterval(() => {
      void (async () => {
        try {
          await getProfile()
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Your session has ended. Please sign in again.'
          if (!isAuthSessionError(message)) return

          await clearStoredToken()
          if (cancelled) return

          setActiveThemeScope(null)
          applyThemePreference(getStoredTheme(null), { persist: false })
          setUser(null)
          setLoginError(message)
        }
      })()
    }, 10000)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [user])

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

  if (sessionBootstrapping) {
    return (
      <div className="app-loading" aria-label="Loading">
        <div className="app-loading-spinner" />
      </div>
    )
  }

  if (!showStaffLogin) {
    if (showCookiePolicyPage) {
      return (
        <CookiePolicyPage
          onBack={() => setShowCookiePolicyPage(false)}
          onOpenStaffLogin={() => {
            setShowCookiePolicyPage(false)
            setShowCookieSystemPage(false)
            setShowTermsPolicyPage(false)
            setShowAboutPage(false)
            setShowStaffLogin(true)
          }}
        />
      )
    }

    if (showCookieSystemPage) {
      return (
        <CookieSystemPage
          onBack={() => setShowCookieSystemPage(false)}
          onOpenStaffLogin={() => {
            setShowCookiePolicyPage(false)
            setShowCookieSystemPage(false)
            setShowTermsPolicyPage(false)
            setShowAboutPage(false)
            setShowStaffLogin(true)
          }}
        />
      )
    }

    if (showTermsPolicyPage) {
      return (
        <TermsPolicyPage
          onBack={() => setShowTermsPolicyPage(false)}
          onOpenStaffLogin={() => {
            setShowCookiePolicyPage(false)
            setShowCookieSystemPage(false)
            setShowTermsPolicyPage(false)
            setShowAboutPage(false)
            setShowStaffLogin(true)
          }}
        />
      )
    }

    if (showAboutPage) {
      return (
        <AboutPage
          onBack={() => setShowAboutPage(false)}
          onOpenStaffLogin={() => {
            setShowCookiePolicyPage(false)
            setShowCookieSystemPage(false)
            setShowAboutPage(false)
            setShowTermsPolicyPage(false)
            setShowStaffLogin(true)
          }}
        />
      )
    }

    return (
      <LandingPage
        onOpenAbout={() => {
          setShowStaffLogin(false)
          setShowCookiePolicyPage(false)
          setShowCookieSystemPage(false)
          setShowTermsPolicyPage(false)
          setShowAboutPage(true)
        }}
        onOpenTermsPolicy={() => {
          setShowStaffLogin(false)
          setShowCookiePolicyPage(false)
          setShowCookieSystemPage(false)
          setShowAboutPage(false)
          setShowTermsPolicyPage(true)
        }}
        onOpenCookiePolicy={() => {
          setShowStaffLogin(false)
          setShowAboutPage(false)
          setShowTermsPolicyPage(false)
          setShowCookieSystemPage(false)
          setShowCookiePolicyPage(true)
        }}
        onOpenCookieSystem={() => {
          setShowStaffLogin(false)
          setShowCookiePolicyPage(false)
          setShowAboutPage(false)
          setShowTermsPolicyPage(false)
          setShowCookieSystemPage(true)
        }}
        onOpenStaffLogin={() => {
          setShowCookiePolicyPage(false)
          setShowCookieSystemPage(false)
          setShowTermsPolicyPage(false)
          setShowAboutPage(false)
          setShowStaffLogin(true)
        }}
      />
    )
  }

  // Show appropriate login page
  return (
    <Login
      onLogin={handleLogin}
      error={loginError}
      loading={loginLoading}
      onBack={() => {
        setShowStaffLogin(false)
        setShowCookiePolicyPage(false)
        setShowCookieSystemPage(false)
        setShowAboutPage(false)
        setLoginError(undefined)
      }}
    />
  )
}

export default App

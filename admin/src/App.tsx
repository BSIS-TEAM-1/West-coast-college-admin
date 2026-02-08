import { useState, useCallback, useEffect } from 'react'
import { login as apiLogin, getStoredToken, setStoredToken, clearStoredToken, getProfile } from './lib/authApi'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import './App.css'

function App() {
  const [user, setUser] = useState<{ username: string } | null>(null)
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
      .then((profile) => setUser({ username: profile.username }))
      .catch(() => clearStoredToken())
      .finally(() => setAuthChecked(true))
  }, [user, authChecked])

  const handleLogin = useCallback(async (username: string, password: string) => {
    setLoginError(undefined)
    setLoginLoading(true)
    try {
      const data = await apiLogin(username, password)
      setStoredToken(data.token)
      setUser({ username: data.username })
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

  if (user) {
    return (
      <Dashboard
        username={user.username}
        onLogout={handleLogout}
        onProfileUpdated={(profile) => setUser({ username: profile.username })}
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

  return (
    <Login
      onLogin={handleLogin}
      error={loginError}
      loading={loginLoading}
    />
  )
}

export default App

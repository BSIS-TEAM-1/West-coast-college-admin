import React, { useState, useEffect } from 'react'
import './Login.css'

type Theme = 'light' | 'dark' | 'auto'

type LoginProps = {
  onLogin: (username: string, password: string) => void
  error?: string
  signUpSuccess?: boolean
  loading?: boolean
}

export default function Login({ onLogin, error, signUpSuccess: _signUpSuccess, loading }: LoginProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [theme, setTheme] = useState<Theme>('auto')

  useEffect(() => {
    const storedTheme = localStorage.getItem('theme')
    if (storedTheme) {
      setTheme(storedTheme as Theme)
    }
  }, [])

  useEffect(() => {
    const applyTheme = (newTheme: Theme) => {
      const root = document.documentElement;
      
      if (newTheme === 'auto') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
      } else {
        root.setAttribute('data-theme', newTheme);
      }
      
      localStorage.setItem('theme', newTheme);
    };

    applyTheme(theme);

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (theme === 'auto') {
        applyTheme('auto');
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme])

  const handleThemeChange = (newTheme: Theme) => {
    setTheme(newTheme);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    onLogin(username, password)
  }

  return (
    <div className="login-page">
      <div className="login-container">
        {/* LEFT SIDE: Hero / Content Area */}
        <div className="login-hero">
          <div className="hero-content">
            <img src="/Logo.jpg" alt="West Coast College" className="hero-logo" />
            <h2 className="hero-title">West Coast College</h2>
            <p className="hero-text">
              Staff Portal - Secure access for authorized personnel only.
              Please ensure you have proper credentials before attempting to login.
            </p>
            {/* You can easily edit or add more content here later */}
          </div>
        </div>

        {/* RIGHT SIDE: Login Form */}
        <div className="login-side">
          <div className="login-card">
            {/* Theme Toggle - Above Sign In */}
            <div className="login-theme-toggle-card">
              <div className="login-theme-options">
                <button
                  type="button"
                  className={`login-theme-btn ${theme === 'light' ? 'active' : ''}`}
                  onClick={() => handleThemeChange('light')}
                  title="Light Mode"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="5"/>
                    <line x1="12" y1="1" x2="12" y2="3"/>
                    <line x1="12" y1="21" x2="12" y2="23"/>
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                    <line x1="1" y1="12" x2="3" y2="12"/>
                    <line x1="21" y1="12" x2="23" y2="12"/>
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                  </svg>
                </button>
                <button
                  type="button"
                  className={`login-theme-btn ${theme === 'dark' ? 'active' : ''}`}
                  onClick={() => handleThemeChange('dark')}
                  title="Dark Mode"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                  </svg>
                </button>
                <button
                  type="button"
                  className={`login-theme-btn ${theme === 'auto' ? 'active' : ''}`}
                  onClick={() => handleThemeChange('auto')}
                  title="Auto Mode"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="4" width="20" height="12" rx="2" ry="2"/>
                    <line x1="6" y1="16" x2="18" y2="16"/>
                    <line x1="8" y1="20" x2="16" y2="20"/>
                  </svg>
                </button>
              </div>
            </div>

            <h1 className="login-title">Sign In</h1>
            <p className="login-subtitle">Enter your credentials to continue</p>

            <form className="login-form" onSubmit={handleSubmit}>
              {error && <p className="login-error" role="alert">{error}</p>}
              
              <label className="login-label">
                Username
                <input
                  type="text"
                  className="login-input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter Username"
                  required
                />
              </label>

              <label className="login-label">
                Password
                <input
                  type="password"
                  className="login-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="********"
                  required
                />
              </label>

              <button type="submit" className="login-submit" disabled={loading}>
                {loading ? 'Authenticating…' : 'Sign In'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
import React, { useEffect, useRef, useState } from 'react'

import './Login.css'
import { applyThemePreference, getStoredTheme, setActiveThemeScope, type ThemePreference } from '../lib/theme'
import { ensureRecaptchaLoaded, executeRecaptchaAction, getRecaptchaSiteKey } from '../lib/recaptcha'

type LoginProps = {
  onLogin: (username: string, password: string, captchaToken?: string) => void
  error?: string
  signUpSuccess?: boolean
  loading?: boolean
  onBack?: () => void
}

const THEME_OPTIONS: Array<{ value: ThemePreference; label: string }> = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'auto', label: 'Auto' }
]

const renderThemeIcon = (theme: ThemePreference) => {
  if (theme === 'light') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="1" x2="12" y2="3" />
        <line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" />
        <line x1="21" y1="12" x2="23" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
      </svg>
    )
  }

  if (theme === 'dark') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="2" y="4" width="20" height="12" rx="2" ry="2" />
      <line x1="6" y1="16" x2="18" y2="16" />
      <line x1="8" y1="20" x2="16" y2="20" />
    </svg>
  )
}

export default function Login({ onLogin, error, signUpSuccess: _signUpSuccess, loading, onBack }: LoginProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [theme, setTheme] = useState<ThemePreference>(() => getStoredTheme(null))
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false)
  const [captchaLoading, setCaptchaLoading] = useState(false)
  const captchaEnabled = import.meta.env.PROD
  const [captchaReady, setCaptchaReady] = useState(!captchaEnabled)
  const recaptchaSiteKey = getRecaptchaSiteKey()
  const devBypassToken = 'dev-bypass'
  const hasInitializedTheme = useRef(false)
  const themeMenuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setActiveThemeScope(null)
  }, [])

  useEffect(() => {
    const applyTheme = (nextTheme: ThemePreference) => {
      applyThemePreference(nextTheme, { animate: hasInitializedTheme.current, scope: null })
      hasInitializedTheme.current = true
    }

    applyTheme(theme)

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleSystemThemeChange = () => {
      if (theme === 'auto') {
        applyTheme('auto')
      }
    }

    mediaQuery.addEventListener('change', handleSystemThemeChange)
    return () => mediaQuery.removeEventListener('change', handleSystemThemeChange)
  }, [theme])

  useEffect(() => {
    if (!isThemeMenuOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (themeMenuRef.current && !themeMenuRef.current.contains(target)) {
        setIsThemeMenuOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsThemeMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isThemeMenuOpen])

  useEffect(() => {
    if (!captchaEnabled) {
      setCaptchaReady(true)
      return
    }

    if (!recaptchaSiteKey) {
      setCaptchaReady(false)
      return
    }

    let mounted = true

    ensureRecaptchaLoaded(recaptchaSiteKey)
      .then(() => {
        if (mounted) setCaptchaReady(true)
      })
      .catch((captchaError) => {
        console.error('Failed to initialize reCAPTCHA v3:', captchaError)
        if (mounted) setCaptchaReady(false)
      })

    return () => {
      mounted = false
    }
  }, [captchaEnabled, recaptchaSiteKey])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (captchaEnabled) {
      if (!recaptchaSiteKey || !captchaReady) {
        return
      }

      try {
        setCaptchaLoading(true)
        const token = await executeRecaptchaAction(recaptchaSiteKey, 'admin_login')
        onLogin(username, password, token)
      } catch (captchaError) {
        console.error('Failed to execute reCAPTCHA v3:', captchaError)
      } finally {
        setCaptchaLoading(false)
      }
      return
    }

    onLogin(username, password, devBypassToken)
  }

  const submitting = Boolean(loading || captchaLoading)
  const submitDisabled = submitting || (captchaEnabled && (!recaptchaSiteKey || !captchaReady))
  const activeThemeOption = THEME_OPTIONS.find(option => option.value === theme) ?? THEME_OPTIONS[2]

  const handleThemeChange = (nextTheme: ThemePreference) => {
    setTheme(nextTheme)
    setIsThemeMenuOpen(false)
  }

  return (
    <div className="login-page">
      <div className="login-shell">
        <section className="login-pane login-pane-brand" aria-label="Portal introduction">
          <div className="login-brand-content">
            <img src="/Logo.jpg" alt="West Coast College" className="hero-logo" />
            <p className="login-kicker">West Coast College</p>
            <h2 className="hero-title">Admin and Registrar Portal</h2>
            <p className="hero-text">
              Secure access for authorized personnel. Sign in to manage records, workflows, and internal
              operations in one protected workspace.
            </p>
            <ul className="hero-list">
              <li>Access controlled account management</li>
              <li>Session security with active monitoring</li>
              <li>Audit-ready administrative workflows</li>
            </ul>
          </div>
        </section>

        <section className="login-pane login-pane-form" aria-label="Sign in">
          <div className="login-card">
            <div className="login-toolbar">
              {onBack && (
                <button type="button" className="login-back-btn" onClick={onBack}>
                  Back to Landing
                </button>
              )}

              <div className="login-theme-dropdown" ref={themeMenuRef}>
                <button
                  type="button"
                  className="login-theme-trigger"
                  aria-haspopup="menu"
                  aria-expanded={isThemeMenuOpen}
                  aria-label="Select theme"
                  onClick={() => setIsThemeMenuOpen(previous => !previous)}
                >
                  <span className="login-theme-trigger-icon">{renderThemeIcon(activeThemeOption.value)}</span>
                  <span className="login-theme-trigger-label">{activeThemeOption.label}</span>
                  <svg className={`login-theme-chevron ${isThemeMenuOpen ? 'open' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {isThemeMenuOpen && (
                  <div className="login-theme-menu" role="menu" aria-label="Theme selection">
                    {THEME_OPTIONS.map(option => (
                      <button
                        key={option.value}
                        type="button"
                        role="menuitemradio"
                        aria-checked={theme === option.value}
                        className={`login-theme-option ${theme === option.value ? 'active' : ''}`}
                        onClick={() => handleThemeChange(option.value)}
                      >
                        <span className="login-theme-option-icon">{renderThemeIcon(option.value)}</span>
                        <span className="login-theme-option-label">{option.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <h1 className="login-title">Sign In</h1>
            <p className="login-subtitle">Enter your credentials to continue.</p>

            <form className="login-form" onSubmit={handleSubmit}>
              {error && <p className="login-error" role="alert">{error}</p>}

              <label className="login-label">
                Username
                <input
                  type="text"
                  className="login-input"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="Enter username"
                  autoComplete="username"
                  required
                />
              </label>

              <label className="login-label">
                Password
                <input
                  type="password"
                  className="login-input"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter password"
                  autoComplete="current-password"
                  required
                />
              </label>

              <button type="submit" className="login-submit" disabled={submitDisabled}>
                {submitting ? 'Authenticating...' : 'Sign In'}
              </button>
            </form>

            <p className="security-note">Protected by reCAPTCHA and secure session controls.</p>
          </div>
        </section>
      </div>
    </div>
  )
}


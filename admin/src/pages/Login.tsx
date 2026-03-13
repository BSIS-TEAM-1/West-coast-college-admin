import React, { useEffect, useRef, useState } from 'react'

import './Login.css'
import type { LoginEmailVerificationChallengeResponse, LoginFlowResponse, LoginResponse } from '../lib/authApi'
import { applyThemePreference, getStoredTheme, setActiveThemeScope, type ThemePreference } from '../lib/theme'
import { ensureRecaptchaLoaded, executeRecaptchaAction, getRecaptchaSiteKey } from '../lib/recaptcha'
import { formatVerificationCountdown, getVerificationSecondsRemaining } from '../lib/verificationTimer'

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (options: { client_id: string; callback: (response: { credential?: string }) => void }) => void
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void
        }
      }
    }
  }
}

type LoginProps = {
  onLogin: (username: string, password: string, captchaToken?: string) => Promise<LoginFlowResponse | null | void> | LoginFlowResponse | null | void
  onGoogleLogin?: (credential: string) => Promise<LoginFlowResponse | null | void> | LoginFlowResponse | null | void
  onVerifyLoginEmailCode?: (challengeToken: string, code: string) => Promise<LoginResponse>
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
const LOGIN_VERIFICATION_CODE_LENGTH = 6

const GoogleIcon = () => (
  <svg viewBox="0 0 18 18" aria-hidden="true">
    <path fill="#EA4335" d="M17.64 9.2045c0-.6382-.0573-1.2518-.1636-1.8409H9v3.4818h4.8436c-.2087 1.125-.8427 2.0782-1.796 2.7164v2.2582h2.9087c1.7018-1.5664 2.6837-3.8746 2.6837-6.6155z" />
    <path fill="#4285F4" d="M9 18c2.43 0 4.4673-.8059 5.9564-2.1791l-2.9087-2.2582c-.8059.54-1.8368.8591-3.0477.8591-2.3441 0-4.3282-1.5832-5.0364-3.7105H.9573v2.3318C2.4382 15.9832 5.4818 18 9 18z" />
    <path fill="#FBBC05" d="M3.9636 10.7105c-.18-.54-.2836-1.1168-.2836-1.7105s.1036-1.1705.2836-1.7105V4.9577H.9573C.3477 6.1723 0 7.5482 0 9s.3477 2.8277.9573 4.0423l3.0063-2.3318z" />
    <path fill="#34A853" d="M9 3.5782c1.3214 0 2.5077.4541 3.4405 1.3459l2.5814-2.5814C13.4632.8918 11.4268 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9577l3.0063 2.3318C4.6718 5.1614 6.6559 3.5782 9 3.5782z" />
  </svg>
)

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

export default function Login({ onLogin, onGoogleLogin, onVerifyLoginEmailCode, error, signUpSuccess: _signUpSuccess, loading, onBack }: LoginProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [theme, setTheme] = useState<ThemePreference>(() => getStoredTheme(null))
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false)
  const [captchaLoading, setCaptchaLoading] = useState(false)
  const [googleButtonReady, setGoogleButtonReady] = useState(false)
  const [googleAuthPending, setGoogleAuthPending] = useState(false)
  const [loginVerificationChallenge, setLoginVerificationChallenge] = useState<LoginEmailVerificationChallengeResponse | null>(null)
  const [loginVerificationDigits, setLoginVerificationDigits] = useState<string[]>(
    () => Array(LOGIN_VERIFICATION_CODE_LENGTH).fill('')
  )
  const [loginVerificationError, setLoginVerificationError] = useState('')
  const [loginVerificationSecondsRemaining, setLoginVerificationSecondsRemaining] = useState<number | null>(null)
  const captchaEnabled = import.meta.env.PROD
  const googleClientId = import.meta.env.VITE_GOOGLE_SIGNIN_CLIENT_ID?.trim() || ''
  const [captchaReady, setCaptchaReady] = useState(!captchaEnabled)
  const recaptchaSiteKey = getRecaptchaSiteKey()
  const devBypassToken = 'dev-bypass'
  const hasInitializedTheme = useRef(false)
  const themeMenuRef = useRef<HTMLDivElement | null>(null)
  const googleButtonHostRef = useRef<HTMLDivElement | null>(null)
  const loginVerificationInputRefs = useRef<(HTMLInputElement | null)[]>([])

  const handleLoginFlowResponse = (result: LoginFlowResponse | null | void) => {
    if (result && 'requiresEmailVerification' in result && result.requiresEmailVerification) {
      setLoginVerificationChallenge(result)
      setLoginVerificationDigits(Array(LOGIN_VERIFICATION_CODE_LENGTH).fill(''))
      setLoginVerificationError('')
      setPassword('')
    }
  }

  useEffect(() => {
    if (loginVerificationChallenge) {
      loginVerificationInputRefs.current[0]?.focus()
    }
  }, [loginVerificationChallenge])

  useEffect(() => {
    if (!loginVerificationChallenge?.expiresAt) {
      setLoginVerificationSecondsRemaining(null)
      return
    }

    const updateCountdown = () => {
      setLoginVerificationSecondsRemaining(
        getVerificationSecondsRemaining(loginVerificationChallenge.expiresAt)
      )
    }

    updateCountdown()
    const intervalId = window.setInterval(updateCountdown, 1000)
    return () => window.clearInterval(intervalId)
  }, [loginVerificationChallenge])

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

  useEffect(() => {
    if (!loading) {
      setGoogleAuthPending(false)
    }
  }, [loading])

  useEffect(() => {
    if (!onGoogleLogin || !googleClientId || !googleButtonHostRef.current) {
      setGoogleButtonReady(false)
      return
    }

    let cancelled = false
    const scriptId = 'google-identity-services-client'

    const renderGoogleButton = () => {
      if (cancelled || !googleButtonHostRef.current || !window.google?.accounts?.id) {
        return
      }

      try {
        googleButtonHostRef.current.innerHTML = ''
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: (response) => {
            const credential = String(response?.credential || '').trim()
            if (!credential) return
            setGoogleAuthPending(true)
            void (async () => {
              try {
                const result = await onGoogleLogin(credential)
                handleLoginFlowResponse(result)
              } catch {
                // App-level error state handles login failures.
              }
            })()
          }
        })

        const availableWidth = Math.round(
          googleButtonHostRef.current.parentElement?.clientWidth
          || googleButtonHostRef.current.clientWidth
          || 320
        )
        const hostWidth = Math.max(180, Math.min(320, availableWidth - 4))

        googleButtonHostRef.current.style.width = `${hostWidth}px`
        
        window.google.accounts.id.renderButton(googleButtonHostRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          shape: 'rectangular',
          text: 'signin_with',
          logo_alignment: 'left',
          width: hostWidth
        })
        setGoogleButtonReady(true)
      } catch (googleRenderError) {
        setGoogleButtonReady(false)
        console.error('Failed to render Google sign-in button:', googleRenderError)
      }
    }

    const handleScriptLoad = () => {
      renderGoogleButton()
    }

    const handleScriptError = () => {
      setGoogleButtonReady(false)
    }

    const existingScript = document.getElementById(scriptId) as HTMLScriptElement | null
    if (existingScript) {
      if (window.google?.accounts?.id) {
        renderGoogleButton()
      } else {
        existingScript.addEventListener('load', handleScriptLoad, { once: true })
        existingScript.addEventListener('error', handleScriptError, { once: true })
      }

      return () => {
        cancelled = true
        existingScript.removeEventListener('load', handleScriptLoad)
        existingScript.removeEventListener('error', handleScriptError)
      }
    }

    const script = document.createElement('script')
    script.id = scriptId
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.addEventListener('load', handleScriptLoad, { once: true })
    script.addEventListener('error', handleScriptError, { once: true })
    document.head.appendChild(script)

    return () => {
      cancelled = true
      script.removeEventListener('load', handleScriptLoad)
      script.removeEventListener('error', handleScriptError)
    }
  }, [googleClientId, onGoogleLogin])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (captchaEnabled) {
      if (!recaptchaSiteKey || !captchaReady) {
        return
      }

      try {
        setCaptchaLoading(true)
        const token = await executeRecaptchaAction(recaptchaSiteKey, 'admin_login')
        const result = await onLogin(username, password, token)
        handleLoginFlowResponse(result)
      } catch (captchaError) {
        console.error('Failed to execute reCAPTCHA v3:', captchaError)
      } finally {
        setCaptchaLoading(false)
      }
      return
    }

    const result = await onLogin(username, password, devBypassToken)
    handleLoginFlowResponse(result)
  }

  async function handleLoginVerificationSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!loginVerificationChallenge || !onVerifyLoginEmailCode) {
      return
    }

    const normalizedCode = loginVerificationDigits.join('')
    if (!new RegExp(`^\\d{${LOGIN_VERIFICATION_CODE_LENGTH}}$`).test(normalizedCode)) {
      setLoginVerificationError('Enter the 6-digit code sent to your email.')
      return
    }

    setLoginVerificationError('')

    try {
      await onVerifyLoginEmailCode(loginVerificationChallenge.challengeToken, normalizedCode)
    } catch (verificationError) {
      setLoginVerificationError(
        verificationError instanceof Error
          ? verificationError.message
          : 'Failed to verify the login email code.'
      )
    }
  }

  const handleLoginVerificationDigitChange = (index: number, event: React.ChangeEvent<HTMLInputElement>) => {
    const digitsOnly = event.target.value.replace(/\D/g, '')
    const nextDigit = digitsOnly ? digitsOnly.slice(-1) : ''

    setLoginVerificationDigits((previous) => {
      const next = [...previous]
      next[index] = nextDigit
      return next
    })

    if (loginVerificationError) {
      setLoginVerificationError('')
    }

    if (nextDigit && index < LOGIN_VERIFICATION_CODE_LENGTH - 1) {
      loginVerificationInputRefs.current[index + 1]?.focus()
      loginVerificationInputRefs.current[index + 1]?.select()
    }
  }

  const handleLoginVerificationDigitKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace') {
      if (loginVerificationDigits[index]) {
        setLoginVerificationDigits((previous) => {
          const next = [...previous]
          next[index] = ''
          return next
        })
        if (loginVerificationError) {
          setLoginVerificationError('')
        }
        return
      }

      if (index > 0) {
        loginVerificationInputRefs.current[index - 1]?.focus()
        setLoginVerificationDigits((previous) => {
          const next = [...previous]
          next[index - 1] = ''
          return next
        })
        if (loginVerificationError) {
          setLoginVerificationError('')
        }
      }
      return
    }

    if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault()
      loginVerificationInputRefs.current[index - 1]?.focus()
      return
    }

    if (event.key === 'ArrowRight' && index < LOGIN_VERIFICATION_CODE_LENGTH - 1) {
      event.preventDefault()
      loginVerificationInputRefs.current[index + 1]?.focus()
      return
    }

    if (event.key.length === 1 && !/\d/.test(event.key)) {
      event.preventDefault()
    }
  }

  const handleLoginVerificationCodePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    const pastedDigits = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, LOGIN_VERIFICATION_CODE_LENGTH)
    if (!pastedDigits) return

    event.preventDefault()
    const nextDigits = Array(LOGIN_VERIFICATION_CODE_LENGTH).fill('')
    for (let index = 0; index < pastedDigits.length; index += 1) {
      nextDigits[index] = pastedDigits[index]
    }
    setLoginVerificationDigits(nextDigits)

    if (loginVerificationError) {
      setLoginVerificationError('')
    }

    const nextFocusIndex = Math.min(pastedDigits.length, LOGIN_VERIFICATION_CODE_LENGTH - 1)
    loginVerificationInputRefs.current[nextFocusIndex]?.focus()
  }

  const closeLoginVerificationModal = () => {
    if (loading) return
    setLoginVerificationChallenge(null)
    setLoginVerificationDigits(Array(LOGIN_VERIFICATION_CODE_LENGTH).fill(''))
    setLoginVerificationError('')
  }

  const submitting = Boolean(loading || captchaLoading)
  const submitDisabled = submitting || (captchaEnabled && (!recaptchaSiteKey || !captchaReady))
  const googleSignInAvailable = Boolean(onGoogleLogin && googleClientId)
  const activeThemeOption = THEME_OPTIONS.find(option => option.value === theme) ?? THEME_OPTIONS[2]
  const loginVerificationCodeExpired = loginVerificationSecondsRemaining === 0

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

              <div className="login-method-stack">
                <button type="submit" className="login-submit login-submit-manual" disabled={submitDisabled}>
                  {submitting ? 'Authenticating...' : 'Manual Sign In'}
                </button>

                <div className="login-method-divider" aria-hidden="true">
                  <span>or</span>
                </div>

                <div className="login-google-section">
                  <div className="login-google-button-frame">
                    {googleSignInAvailable ? (
                      <div
                        ref={googleButtonHostRef}
                        className={`login-google-button-host ${(loading && googleAuthPending) ? 'is-busy' : ''}`}
                        aria-live="polite"
                      />
                    ) : (
                      <button type="button" className="login-google-fallback" disabled>
                        <span className="login-google-fallback-icon">
                          <GoogleIcon />
                        </span>
                        <span className="login-google-fallback-text">Sign in with Google</span>
                      </button>
                    )}
                  </div>
                  {googleSignInAvailable && !googleButtonReady && (
                    <p className="login-google-status">Preparing Google sign-in...</p>
                  )}
                  {googleSignInAvailable && loading && googleAuthPending && (
                    <p className="login-google-status">Completing Google sign-in...</p>
                  )}
                </div>
              </div>
            </form>

            <p className="security-note">Protected by reCAPTCHA and secure session controls.</p>
          </div>
        </section>
      </div>

      {loginVerificationChallenge && (
        <div className="login-verify-modal-backdrop" role="presentation">
          <div className="login-verify-modal" role="dialog" aria-modal="true" aria-labelledby="login-verify-title">
            <h3 id="login-verify-title" className="login-verify-modal-title">Confirm Login by Email</h3>
            <p className="login-verify-modal-desc">
              Enter the 6-digit code sent to <strong>{loginVerificationChallenge.destination || loginVerificationChallenge.email}</strong>.
            </p>
            {loginVerificationSecondsRemaining !== null && (
              <p className={`login-verify-modal-timer ${loginVerificationCodeExpired ? 'expired' : ''}`}>
                {loginVerificationCodeExpired
                  ? 'Code expired. Sign in again to request a new one.'
                  : `Code expires in ${formatVerificationCountdown(loginVerificationSecondsRemaining)}`}
              </p>
            )}

            <form className="login-verify-modal-form" onSubmit={handleLoginVerificationSubmit}>
              {loginVerificationError && (
                <p className="login-verify-modal-error" role="alert">{loginVerificationError}</p>
              )}
              <div className="login-verify-otp-group">
                {loginVerificationDigits.map((digit, index) => (
                  <input
                    key={`login-otp-digit-${index}`}
                    ref={(element) => { loginVerificationInputRefs.current[index] = element }}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete={index === 0 ? 'one-time-code' : 'off'}
                    maxLength={1}
                    className="login-verify-otp-input"
                    value={digit}
                    onChange={(event) => handleLoginVerificationDigitChange(index, event)}
                    onKeyDown={(event) => handleLoginVerificationDigitKeyDown(index, event)}
                    onPaste={handleLoginVerificationCodePaste}
                    aria-label={`Login verification digit ${index + 1}`}
                  />
                ))}
              </div>
              <div className="login-verify-modal-actions">
                <button
                  type="button"
                  className="login-verify-cancel-btn"
                  onClick={closeLoginVerificationModal}
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="login-verify-submit-btn"
                  disabled={loading}
                >
                  {loading ? 'Verifying...' : 'Verify Login'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

import React, { useState, useEffect, useRef } from 'react'

import './Login.css'
import {
  applyThemePreference,
  getStoredTheme,
  setActiveThemeScope,
  type ResolvedTheme,
  type ThemePreference
} from '../lib/theme'
import {
  ensureRecaptchaLoaded,
  executeRecaptchaAction,
  getRecaptchaSiteKey
} from '../lib/recaptcha'



type Theme = ThemePreference

type VantaThemeOptions = {
  backgroundColor: number
  color: number
  color2: number
}

type VantaGlobeEffect = {
  destroy: () => void
  setOptions?: (options: VantaThemeOptions) => void
  renderer?: {
    setClearColor?: (color: number, alpha?: number) => void
  }
}

declare global {
  interface Window {
    THREE?: unknown
    VANTA?: {
      GLOBE: (options: Record<string, unknown>) => VantaGlobeEffect
    }
  }
}

const loadExternalScript = (src: string, isLoaded: () => boolean) =>
  new Promise<void>((resolve, reject) => {
    if (isLoaded()) {
      resolve()
      return
    }

    const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null
    if (existing) {
      const waitForScript = window.setInterval(() => {
        if (isLoaded()) {
          window.clearInterval(waitForScript)
          resolve()
        }
      }, 50)
      window.setTimeout(() => {
        window.clearInterval(waitForScript)
        if (!isLoaded()) reject(new Error(`Failed to load script: ${src}`))
      }, 5000)
      return
    }

    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.onload = () => {
      if (isLoaded()) resolve()
      else reject(new Error(`Script loaded but API missing: ${src}`))
    }
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`))
    document.body.appendChild(script)
  })

const getVantaThemeOptions = (theme: ResolvedTheme): VantaThemeOptions =>
  theme === 'dark'
    ? {
        // Dark mode: dots and grid lines are both blue.
        backgroundColor: 0xffffff,
        color: 0x2563eb,
        color2: 0x2563eb
      }
    : {
        // Light mode: keep the same blue accents (no orange).
        backgroundColor: 0x0f172a,
        color: 0x2563eb,
        color2: 0x2563eb
      }



type LoginProps = {

  onLogin: (username: string, password: string, captchaToken?: string) => void

  error?: string

  signUpSuccess?: boolean

  loading?: boolean

  onBack?: () => void

}



export default function Login({ onLogin, error, signUpSuccess: _signUpSuccess, loading, onBack }: LoginProps) {

  const [username, setUsername] = useState('')

  const [password, setPassword] = useState('')

  const [theme, setTheme] = useState<Theme>(() => getStoredTheme(null))
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('light')

  const [captchaLoading, setCaptchaLoading] = useState(false)
  const captchaEnabled = import.meta.env.PROD
  const [captchaReady, setCaptchaReady] = useState(!captchaEnabled)
  const recaptchaSiteKey = getRecaptchaSiteKey()
  const devBypassToken = 'dev-bypass'
  const heroRef = useRef<HTMLDivElement | null>(null)
  const vantaRef = useRef<VantaGlobeEffect | null>(null)
  const resolvedThemeRef = useRef<ResolvedTheme>('light')
  const hasInitializedTheme = useRef(false)



  useEffect(() => {
    setActiveThemeScope(null)
  }, [])

  useEffect(() => {

    const applyTheme = (newTheme: Theme): ResolvedTheme => {
      const computedTheme = applyThemePreference(newTheme, { animate: hasInitializedTheme.current, scope: null })
      hasInitializedTheme.current = true
      setResolvedTheme(computedTheme)
      return computedTheme

    }

    

    applyTheme(theme)

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const handleChange = () => {

      if (theme === 'auto') {

        applyTheme('auto')

      }

    }



    mediaQuery.addEventListener('change', handleChange)

    return () => mediaQuery.removeEventListener('change', handleChange)

  }, [theme])

  useEffect(() => {
    resolvedThemeRef.current = resolvedTheme
  }, [resolvedTheme])

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
      .catch((error) => {
        console.error('Failed to initialize reCAPTCHA v3:', error)
        if (mounted) setCaptchaReady(false)
      })

    return () => {
      mounted = false
    }
  }, [captchaEnabled, recaptchaSiteKey])

  useEffect(() => {
    let cancelled = false

    const initVanta = async () => {
      if (!heroRef.current) return

      try {
        await loadExternalScript(
          'https://cdnjs.cloudflare.com/ajax/libs/three.js/r121/three.min.js',
          () => Boolean(window.THREE)
        )
        await loadExternalScript(
          'https://cdn.jsdelivr.net/npm/vanta@latest/dist/vanta.globe.min.js',
          () => Boolean(window.VANTA?.GLOBE)
        )
      } catch (scriptError) {
        console.error(scriptError)
        return
      }

      if (cancelled || !heroRef.current || !window.VANTA?.GLOBE) return

      if (vantaRef.current) return

      vantaRef.current = window.VANTA.GLOBE({
        el: heroRef.current,
        mouseControls: true,
        touchControls: true,
        gyroControls: false,
        minHeight: 200,
        minWidth: 200,
        scale: 1,
        scaleMobile: 1,
        size: 1.2,
        ...getVantaThemeOptions(resolvedThemeRef.current)
      })
    }

    void initVanta()

    return () => {
      cancelled = true
      if (vantaRef.current) {
        vantaRef.current.destroy()
        vantaRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    const instance = vantaRef.current
    if (!instance) return

    const options = getVantaThemeOptions(resolvedTheme)
    if (typeof instance.setOptions === 'function') {
      instance.setOptions(options)
      return
    }

    if (instance.renderer && typeof instance.renderer.setClearColor === 'function') {
      instance.renderer.setClearColor(options.backgroundColor, 1)
    }
  }, [resolvedTheme])



  const handleThemeChange = (newTheme: Theme) => {

    setTheme(newTheme);

  }



  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {

    e.preventDefault()

    if (captchaEnabled) {
      if (!recaptchaSiteKey || !captchaReady) {
        return
      }

      try {
        setCaptchaLoading(true)
        const token = await executeRecaptchaAction(recaptchaSiteKey, 'admin_login')
        onLogin(username, password, token)
      } catch (error) {
        console.error('Failed to execute reCAPTCHA v3:', error)
      } finally {
        setCaptchaLoading(false)
      }
      return
    }

    onLogin(username, password, devBypassToken)

  }



  return (

    <div className="login-page">

      <div className="login-container">

        {/* LEFT SIDE: Hero / Content Area */}

        <div className="login-hero" ref={heroRef}>

          <div className="hero-content" style={{ zIndex: 3, color: resolvedTheme === 'dark' ? '#0f172a' : '#ffffff' }}>

            <img src="/Logo.jpg" alt="West Coast College" className="hero-logo" style={{zIndex: 3}} />

            <h2 className="hero-title" style={{zIndex: 3}}>West Coast College</h2>

            <p className="hero-text" style={{zIndex: 3}}>

              Secure access for authorized personnel only.

              Please ensure you have proper credentials before attempting to login.

            </p>

            {/* You can easily edit or add more content here */}

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



            {onBack && (
              <button type="button" className="login-back-btn" onClick={onBack}>
                Back to Landing
              </button>
            )}

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

                  onChange={(e) => setPassword(e.target.value)}

                  placeholder="********"
                  autoComplete="current-password"

                  required

                />

              </label>



              <button type="submit" className="login-submit" disabled={loading || captchaLoading || (captchaEnabled && (!recaptchaSiteKey || !captchaReady))}>

                {(loading || captchaLoading) ? 'Authenticating...' : 'Sign In'}

              </button>

            </form>

          </div>

          {/* Security Badge */}
          <div className="security-badge">
            <span className="security-text">Protected by:</span>
            <span className="security-provider">SecureShield</span>
          </div>
        </div>

      </div>

    </div>

  )

}


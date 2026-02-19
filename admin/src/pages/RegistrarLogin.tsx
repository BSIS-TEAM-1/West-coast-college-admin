import React, { useEffect, useState } from 'react'
import './Login.css'
import {
  ensureRecaptchaLoaded,
  executeRecaptchaAction,
  getRecaptchaSiteKey
} from '../lib/recaptcha'

type LoginProps = {
  onLogin: (username: string, password: string, captchaToken: string) => void
  error?: string
  loading?: boolean
}

export default function RegistrarLogin({ onLogin, error, loading }: LoginProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [captchaLoading, setCaptchaLoading] = useState(false)
  const captchaEnabled = import.meta.env.PROD
  const [captchaReady, setCaptchaReady] = useState(!captchaEnabled)
  const recaptchaSiteKey = getRecaptchaSiteKey()
  const devBypassToken = 'dev-bypass'

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

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()

    if (captchaEnabled) {
      if (!recaptchaSiteKey || !captchaReady) {
        return
      }

      try {
        setCaptchaLoading(true)
        const token = await executeRecaptchaAction(recaptchaSiteKey, 'registrar_login')
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
      <div className="login-card">
        <img src="/Logo.jpg" alt="West Coast College" className="login-logo" />
        <h1 className="login-title">West Coast College</h1>
        <p className="login-subtitle">Registrar Portal</p>

        <form className="login-form" onSubmit={handleSubmit}>
          {error && <p className="login-error" role="alert">{error}</p>}
          <label className="login-label">
            Registrar Username
            <input
              type="text"
              className="login-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter Registrar Username"
              autoComplete="username"
              required
            />
          </label>
          <label className="login-label">
            Credential Passcode
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
          <button
            type="submit"
            className="login-submit"
            disabled={loading || captchaLoading || (captchaEnabled && (!recaptchaSiteKey || !captchaReady))}
          >
            {(loading || captchaLoading) ? 'Signing in...' : 'Access Registrar Portal'}
          </button>
        </form>
      </div>
    </div>
  )
}

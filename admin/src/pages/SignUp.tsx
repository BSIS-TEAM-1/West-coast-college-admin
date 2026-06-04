import React, { useState } from 'react'
import { signUp } from '../lib/authApi'
import './SignUp.css'

type SignUpProps = {
  onSuccess: () => void
  onSwitchToLogin: () => void
}

export default function SignUp({ onSuccess, onSwitchToLogin }: SignUpProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(undefined)

    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    try {
      await signUp(username.trim(), password)
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign up failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="signup-page">
      <main className="signup-shell" aria-label="Create West Coast College account">
        <section className="signup-card">
          <div className="signup-toolbar">
            <button type="button" className="signup-back-btn" onClick={onSwitchToLogin}>
              <span className="material-symbols-outlined" aria-hidden="true">arrow_back</span>
              <span className="signup-back-text">Back to Sign In</span>
            </button>
          </div>

          <div className="signup-brand-mark">
            <img src="/logo-bg-removed.png" alt="West Coast College" className="signup-logo" />
          </div>
          <p className="signup-kicker">West Coast College</p>
          <h1 className="signup-title">Create Account</h1>
          <p className="signup-subtitle">Register an authorized admin portal account.</p>

          <form className="signup-form" onSubmit={handleSubmit}>
            {error && <p className="signup-error" role="alert">{error}</p>}
            <label className="signup-label">
              Admin Username
              <span className="signup-input-wrap">
                <input
                  type="text"
                  className="signup-input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Choose a username"
                  autoComplete="username"
                  required
                />
                <span className="material-symbols-outlined" aria-hidden="true">person</span>
              </span>
            </label>
            <label className="signup-label">
              Passcode
              <span className="signup-input-wrap">
                <input
                  type="password"
                  className="signup-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  autoComplete="new-password"
                  required
                  minLength={6}
                />
                <span className="material-symbols-outlined" aria-hidden="true">lock</span>
              </span>
            </label>
            <label className="signup-label">
              Confirm Passcode
              <span className="signup-input-wrap">
                <input
                  type="password"
                  className="signup-input"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter passcode"
                  autoComplete="new-password"
                  required
                />
                <span className="material-symbols-outlined" aria-hidden="true">verified_user</span>
              </span>
            </label>
            <button type="submit" className="signup-submit" disabled={loading}>
              {loading ? 'Creating...' : 'Create Account'}
            </button>
          </form>

          <div className="signup-footer">
            <p>
              Already have an account?{' '}
              <button type="button" className="signup-link" onClick={onSwitchToLogin}>
                Sign in
              </button>
            </p>
            <small>© 2026 West Coast College. Institutional Policy Applied.</small>
          </div>
        </section>
      </main>
      <div className="signup-ambient" aria-hidden="true">
        <span />
        <span />
      </div>
    </div>
  )
}

import React, { useState } from 'react'
import './Login.css'

type LoginProps = {
  onLogin: (username: string, password: string) => void
  error?: string
  signUpSuccess?: string
  loading?: boolean
}

export default function Login({ onLogin, error, signUpSuccess: _signUpSuccess, loading }: LoginProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    onLogin(username, password)
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <img src="/Logo.jpg" alt="West Coast College" className="login-logo" />
        <h1 className="login-title">West Coast College</h1>
        <p className="login-subtitle">Admin credential Access</p>

        <form className="login-form" onSubmit={handleSubmit}>
          {/* {signUpSuccess && <p className="login-success" role="status">{signUpSuccess}</p>} */}
          {error && <p className="login-error" role="alert">{error}</p>}
          <label className="login-label">
            Admin Username
            <input
              type="text"
              className="login-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Input Admin Username"
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
          <button type="submit" className="login-submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Access'}
          </button>
        </form>

        {/* <p className="login-footer">
          No account?{' '}
          <button type="button" className="login-link" onClick={onSwitchToSignUp}>
            Create admin account
          </button>
        </p> */}
      </div>
    </div>
  )
}

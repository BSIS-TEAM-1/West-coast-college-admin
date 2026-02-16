import React, { useState, useEffect } from 'react'

import { animate } from 'animejs'
import ReCAPTCHA from 'react-google-recaptcha'

import './Login.css'



type Theme = 'light' | 'dark' | 'auto'



type LoginProps = {

  onLogin: (username: string, password: string, captchaToken: string) => void

  error?: string

  signUpSuccess?: boolean

  loading?: boolean

}



export default function Login({ onLogin, error, signUpSuccess: _signUpSuccess, loading }: LoginProps) {

  const [username, setUsername] = useState('')

  const [password, setPassword] = useState('')

  const [theme, setTheme] = useState<Theme>('auto')

  const [captchaToken, setCaptchaToken] = useState<string | null>(null)



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



  const handleTileHover = (index: number) => {

    const tiles = document.querySelectorAll('.tile');

    animate(tiles, {

      scale: [

        {value: 1.5, duration: 300, easing: 'easeOutQuad'},

        {value: 1, duration: 500, delay: 500, easing: 'easeOutElastic(1, .5)'}

      ],

      delay: (_: any, i: number) => {

        const distance = Math.abs(i - index);

        const rowDistance = Math.floor(distance / 6);

        const colDistance = distance % 6;

        return (rowDistance + colDistance) * 50;

      }

    });

  }



  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {

    const rect = e.currentTarget.getBoundingClientRect();

    const x = e.clientX - rect.left;

    const y = e.clientY - rect.top;

    

    const tiles = document.querySelectorAll('.tile');

    const cols = 6;

    const rows = 6;

    

    tiles.forEach((tile, index) => {

      const tileElement = tile as HTMLElement;

      const col = index % cols;

      const row = Math.floor(index / cols);

      

      const tileX = (col + 0.5) * (rect.width / cols);

      const tileY = (row + 0.5) * (rect.height / rows);

      

      const distance = Math.sqrt(Math.pow(x - tileX, 2) + Math.pow(y - tileY, 2));

      const maxDistance = Math.sqrt(Math.pow(rect.width, 2) + Math.pow(rect.height, 2));

      const intensity = Math.max(0, 1 - distance / maxDistance);

      

      const targetOpacity = 0.2 + (intensity * 0.4);

      const targetScale = 1 + (intensity * 0.3);

      

      animate(tileElement, {

        opacity: targetOpacity,

        scale: targetScale,

        duration: 100,

        easing: 'easeOutQuad'

      });

    });

  }



  const handleMouseLeave = () => {

    const tiles = document.querySelectorAll('.tile');

    

    tiles.forEach((tile) => {

      const tileElement = tile as HTMLElement;

      animate(tileElement, {

        opacity: 0.2,

        scale: 1,

        duration: 300,

        easing: 'easeOutQuad'

      });

    });

  }



  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {

    e.preventDefault()

    if (!captchaToken) {
      return; // CAPTCHA not completed
    }

    onLogin(username, password, captchaToken)

  }



  return (

    <div className="login-page">

      <div className="login-container">

        {/* LEFT SIDE: Hero / Content Area */}

        <div className="login-hero">

          {/* Interactive Tile Grid Overlay */}

          <div 

            className="tile-grid-overlay"

            onMouseMove={handleMouseMove}

            onMouseLeave={handleMouseLeave}

          >

            <div className="tile-grid">

              {Array.from({ length: 36 }, (_, i) => (

                <div 

                  key={i} 

                  className="tile"

                  onMouseEnter={() => handleTileHover(i)}

                />

              ))}

            </div>

          </div>

          <div className="hero-content" style={{zIndex: 3}}>

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



              <button type="submit" className="login-submit" disabled={loading || !captchaToken}>

                {loading ? 'Authenticating…' : 'Sign In'}

              </button>

              <div className="recaptcha-container" style={{ marginTop: '1rem', display: 'flex', justifyContent: 'center' }}>
                <ReCAPTCHA
                  sitekey={import.meta.env.VITE_REACT_APP_RECAPTCHA_SITE_KEY || '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI'} // Test key for development
                  onChange={(token: string | null) => setCaptchaToken(token)}
                  onExpired={() => setCaptchaToken(null)}
                  theme={theme === 'dark' ? 'dark' : 'light'}
                />
              </div>

            </form>

          </div>

          {/* Security Badge */}
          <div className="security-badge">
            <span className="security-text">Protected by:</span>
            <span className="security-provider">WCC SecureShield</span>
          </div>
        </div>

      </div>

    </div>

  )

}
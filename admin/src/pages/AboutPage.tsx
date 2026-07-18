import { useEffect, useState } from 'react'
import './AboutPage.css'
import {
  applyThemePreference,
  getStoredTheme,
  setActiveThemeScope,
  type ThemePreference
} from '../lib/theme'

type AboutPageProps = {
  onBack: () => void
}

const WCC_MAP_URL = 'https://maps.app.goo.gl/DQDVxvXcGEsyJRjR9'
const WCC_MAP_EMBED_URL = 'https://www.google.com/maps?q=West%20Coast%20College&output=embed'

const coreValues = [
  {
    icon: 'verified_user',
    title: 'Integrity',
    description: 'Upholding the highest moral and ethical standards in all academic and professional pursuits.'
  },
  {
    icon: 'school',
    title: 'Scholarship',
    description: 'A dedicated pursuit of knowledge, rigorous inquiry, and intellectual curiosity across all fields.'
  },
  {
    icon: 'volunteer_activism',
    title: 'Service',
    description: 'Commitment to giving back to the community and using expertise to serve the common good.'
  },
  {
    icon: 'groups',
    title: 'Community',
    description: 'Fostering an inclusive environment of mutual respect, collaboration, and shared success.'
  }
]

export default function AboutPage({ onBack }: AboutPageProps) {
  const [theme, setTheme] = useState<ThemePreference>(() => getStoredTheme(null))
  const [isNavOpen, setIsNavOpen] = useState(false)

  useEffect(() => {
    setActiveThemeScope(null)
    const initialTheme = getStoredTheme(null)
    setTheme(initialTheme)
    applyThemePreference(initialTheme, { persist: false, scope: null })
  }, [])

  useEffect(() => {
    if (theme !== 'auto') return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleThemeUpdate = () => {
      applyThemePreference('auto', { animate: true, scope: null })
    }

    mediaQuery.addEventListener('change', handleThemeUpdate)
    return () => mediaQuery.removeEventListener('change', handleThemeUpdate)
  }, [theme])

  useEffect(() => {
    if (!isNavOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsNavOpen(false)
      }
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null
      if (!target?.closest('.about-nav-panel') && !target?.closest('.about-menu-btn')) {
        setIsNavOpen(false)
      }
    }

    document.body.classList.add('about-drawer-open')
    window.addEventListener('keydown', handleKeyDown)
    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      document.body.classList.remove('about-drawer-open')
      window.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [isNavOpen])

  const handleThemeChange = (nextTheme: ThemePreference) => {
    setTheme(nextTheme)
    applyThemePreference(nextTheme, { animate: true, scope: null })
  }

  const handleBack = () => {
    setIsNavOpen(false)
    onBack()
  }

  const handleSectionClick = () => {
    setIsNavOpen(false)
  }

  const toggleDarkLightTheme = () => {
    handleThemeChange(theme === 'dark' ? 'light' : 'dark')
  }

  const displayedTheme = theme === 'auto' ? 'Auto' : theme === 'dark' ? 'Dark' : 'Light'

  return (
    <div className="about-page">
      <nav className="about-nav">
        <div className="container about-container">
          <button type="button" className="about-brand" onClick={handleBack}>
            <img src="/logo-bg-removed.png" alt="West Coast College seal" />
            <span>West Coast College</span>
          </button>

          <button
            type="button"
            className="about-menu-btn"
            aria-controls="aboutNavigation"
            aria-expanded={isNavOpen}
            aria-label="Open navigation"
            onClick={() => setIsNavOpen(previous => !previous)}
          >
            <span className="material-symbols-outlined" aria-hidden="true">menu</span>
          </button>

          <button
            type="button"
            className={`about-mobile-backdrop ${isNavOpen ? 'is-open' : ''}`}
            aria-label="Close navigation"
            onClick={() => setIsNavOpen(false)}
          />

          <div
            className={`about-nav-panel ${isNavOpen ? 'is-open' : ''}`}
            id="aboutNavigation"
            aria-label="About page sections"
          >
            <div className="about-drawer-head">
              <div className="about-drawer-brand">
                <img src="/logo-bg-removed.png" alt="" aria-hidden="true" />
                <span>Menu</span>
              </div>
              <button
                type="button"
                className="about-drawer-close"
                aria-label="Close navigation"
                onClick={() => setIsNavOpen(false)}
              >
                <span className="material-symbols-outlined" aria-hidden="true">close</span>
              </button>
            </div>

            <div className="about-nav-links">
              <a href="#history" onClick={handleSectionClick}>Admissions</a>
              <a href="#commitment" onClick={handleSectionClick}>Academics</a>
              <a href="#values" onClick={handleSectionClick}>Research</a>
              <a href="#campus" onClick={handleSectionClick}>Campus Life</a>
              <a href="#footer" onClick={handleSectionClick}>Giving</a>
            </div>

            <div className="about-theme-tools">
              <div className="about-theme-picker">
                <span>Theme</span>
                <select
                  value={theme}
                  onChange={event => handleThemeChange(event.target.value as ThemePreference)}
                  aria-label="Theme mode selector"
                >
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                  <option value="auto">Auto</option>
                </select>
              </div>
              <button
                type="button"
                className="about-theme-icon-btn"
                onClick={toggleDarkLightTheme}
                aria-label={`Current theme: ${displayedTheme}`}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  {theme === 'dark' ? 'light_mode' : 'dark_mode'}
                </span>
              </button>
            </div>
          </div>

          <button type="button" className="about-portal-btn" onClick={handleBack}>
            Student Portal
          </button>
        </div>
      </nav>

      <main>
        <section className="about-hero" aria-label="About West Coast College">
          <div className="about-hero-glow" aria-hidden="true" />
          <div className="container about-container about-hero-content">
            <img src="/logo-bg-removed.png" alt="West Coast College seal" className="about-hero-seal" />
            <h1>Our Legacy of Excellence</h1>
            <p>
              Forging intellectual leaders and community pioneers in the Bicol Region since 2000.
              A tradition of rigor, a future of innovation.
            </p>
          </div>
        </section>

        <section className="about-history" id="history">
          <div className="container about-container">
            <div className="row g-5 align-items-center">
              <div className="col-lg-7">
                <span className="about-kicker">History &amp; Heritage</span>
                <h2>A Visionary Journey in the Bicol Region</h2>
                <div className="about-copy-stack">
                  <p>
                    Founded at the turn of the millennium, West Coast College emerged as a response
                    to the growing need for high-tier academic instruction that respects local
                    heritage while embracing global standards. What began as a modest specialized
                    training center has evolved into a multi-disciplinary institution of choice.
                  </p>
                  <p>
                    Over two decades, we have expanded our campus and our curriculum, maintaining an
                    unwavering focus on producing graduates who are not only technically proficient
                    but also ethically grounded. Our growth mirrors the vibrant development of our
                    region, serving as a cornerstone for intellectual and economic progress.
                  </p>
                </div>
              </div>

              <div className="col-lg-5">
                <div className="about-history-image-card">
                  <div className="about-est-badge">Est. 2000</div>
                  <img src="/intro-img2.png" alt="West Coast College campus feature" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="about-commitment" id="commitment">
          <div className="container about-container">
            <div className="row g-5">
              <div className="col-md-6">
                <article className="about-commitment-block">
                  <h3>Our Vision</h3>
                  <p>
                    By providing quality education, the College envisions itself as an educational
                    institution that would develop highly disciplined and professionally competent,
                    appreciative-of-Filipino-culture individuals who would contribute to building a
                    just and humane Philippine society.
                  </p>
                </article>
              </div>

              <div className="col-md-6">
                <article className="about-commitment-block">
                  <h3>Our Mission</h3>
                  <p>
                    West Coast College is committed to providing holistic education that empowers
                    students through critical thinking, cultural appreciation, and community service.
                    We strive to foster an environment where scholarship and integrity meet to address
                    the challenges of a modern world.
                  </p>
                </article>
              </div>
            </div>
          </div>
        </section>

        <section className="about-values" id="values">
          <div className="container about-container">
            <div className="about-section-head text-center">
              <span className="about-kicker">Our Pillars</span>
              <h2>The Values That Guide Us</h2>
            </div>

            <div className="row g-4">
              {coreValues.map(value => (
                <div className="col-sm-6 col-lg-3" key={value.title}>
                  <article className="about-value-card h-100">
                    <span className="material-symbols-outlined" aria-hidden="true">{value.icon}</span>
                    <h3>{value.title}</h3>
                    <p>{value.description}</p>
                  </article>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="about-campus" id="campus">
          <div className="container about-container">
            <div className="about-section-head">
              <span className="about-kicker">The Grounds</span>
              <h2>Our Campus</h2>
            </div>

            <div className="row g-4">
              <div className="col-md-8">
                <div className="about-campus-main">
                  <img src="/schoolLogo1.png" alt="West Coast College campus visual" />
                </div>
              </div>
              <div className="col-md-4">
                <div className="about-campus-side">
                  <img src="/SchoolLogo2.png" alt="West Coast College seal" />
                </div>
                <div className="about-campus-quote">
                  <p>
                    A sanctuary for intellectual growth and discovery, rooted in the Bicol Region.
                  </p>
                  <span>Est. 2000</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="about-location" id="location">
          <div className="container about-container">
            <div className="row g-5 align-items-center">
              <div className="col-lg-6">
                <span className="about-kicker">Location</span>
                <h2>Find Us</h2>
                <div className="about-location-list">
                  <div>
                    <span className="material-symbols-outlined" aria-hidden="true">location_on</span>
                    <p>West Coast College, Bicol Region, Philippines</p>
                  </div>
                  <div>
                    <span className="material-symbols-outlined" aria-hidden="true">call</span>
                    <p>0977 827 6806</p>
                  </div>
                </div>
                <a
                  className="about-directions-btn"
                  href={WCC_MAP_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  Get Directions
                  <span className="material-symbols-outlined" aria-hidden="true">directions</span>
                </a>
              </div>

              <div className="col-lg-6">
                <div className="about-map-card" aria-label="West Coast College mini map">
                  <iframe
                    title="West Coast College location map"
                    src={WCC_MAP_EMBED_URL}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="about-footer" id="footer">
        <div className="container about-container">
          <div className="row g-5">
            <div className="col-lg-5">
              <h3>West Coast College</h3>
              <p>
                Empowering minds and shaping futures through excellence in education, research,
                and community engagement.
              </p>
            </div>

            <div className="col-lg-7">
              <div className="about-footer-links">
                <div>
                  <span>Quick Links</span>
                  <button type="button" onClick={onBack}>Student Portal</button>
                  <button type="button" onClick={onBack}>Home</button>
                </div>
                <div>
                  <span>Resources</span>
                  <a href="#campus">Campus Map</a>
                  <a href="#location">Accessibility</a>
                </div>
                <div>
                  <span>Connect</span>
                  <a href="mailto:westcoastcollegeregistrar@gmail.com">Contact Directory</a>
                  <a href="tel:+639778276806">Call Registrar</a>
                </div>
              </div>
            </div>
          </div>

          <div className="about-footer-bottom">
            <p>© 2026 West Coast College. All Rights Reserved. Institutional Authority &amp; Excellence.</p>
            <div>
              <span className="material-symbols-outlined" aria-hidden="true">face_nod</span>
              <span className="material-symbols-outlined" aria-hidden="true">language</span>
              <span className="material-symbols-outlined" aria-hidden="true">share</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

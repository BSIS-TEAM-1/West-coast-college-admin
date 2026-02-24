import { useEffect, useRef, useState } from 'react'
import './LandingPage.css'
import {
  applyThemePreference,
  getStoredTheme,
  setActiveThemeScope,
  type ThemePreference
} from '../lib/theme'

type LandingPageProps = {
  onOpenAbout: () => void
  onOpenTermsPolicy: () => void
  onOpenCookiePolicy: () => void
  onOpenCookieSystem: () => void
  onOpenSignIn: () => void
  onOpenApplicantMaintenance: () => void
}

type LandingVideoItem = {
  title: string
  src: string
  optimizedSrc: string
  poster?: string
}

const LANDING_VIDEOS: LandingVideoItem[] = [
  {
    title: '2024 SHS Graduation Ceremony',
    src: '/2024SHSintrovid.mp4',
    optimizedSrc: '/videos/2024SHSintrovid.mp4',
    poster: '/intro-img1.png'
  },
  {
    title: '2024 Graduation Ceremony',
    src: '/2024introvid.mp4',
    optimizedSrc: '/videos/2024introvid.mp4',
    poster: '/intro-img2.png'
  },
  {
    title: 'Video Premiere "West Coast College"',
    src: '/landingpagevideo.mp4',
    optimizedSrc: '/videos/landingpagevideo.mp4'
  }
]

const TITLE_FADE_MS = 220

function LandingVideoCarousel() {
  const useOptimizedSourceByDefault = import.meta.env.PROD
  const [activeVideoIndex, setActiveVideoIndex] = useState(0)
  const [isVideoPlaying, setIsVideoPlaying] = useState(false)
  const [isTitleFading, setIsTitleFading] = useState(false)
  const [currentVideoSrc, setCurrentVideoSrc] = useState<string>(() =>
    useOptimizedSourceByDefault ? LANDING_VIDEOS[0].optimizedSrc : LANDING_VIDEOS[0].src
  )
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const fadeTimeoutRef = useRef<number | null>(null)

  const activeVideo = LANDING_VIDEOS[activeVideoIndex]
  const expectedDefaultSrc = useOptimizedSourceByDefault
    ? activeVideo.optimizedSrc
    : activeVideo.src

  useEffect(() => {
    return () => {
      if (fadeTimeoutRef.current !== null) {
        window.clearTimeout(fadeTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    setCurrentVideoSrc(expectedDefaultSrc)
  }, [expectedDefaultSrc])

  const goToSlide = (nextIndex: number) => {
    if (isTitleFading) return

    const totalSlides = LANDING_VIDEOS.length
    const normalizedIndex = (nextIndex + totalSlides) % totalSlides
    if (normalizedIndex === activeVideoIndex) return

    const currentVideo = videoRef.current
    if (currentVideo) {
      currentVideo.pause()
      currentVideo.currentTime = 0
    }

    setIsVideoPlaying(false)
    setIsTitleFading(true)

    fadeTimeoutRef.current = window.setTimeout(() => {
      setActiveVideoIndex(normalizedIndex)
      window.requestAnimationFrame(() => {
        setIsTitleFading(false)
      })
      fadeTimeoutRef.current = null
    }, TITLE_FADE_MS)
  }

  const togglePlayback = () => {
    const video = videoRef.current
    if (!video) return

    if (video.paused || video.ended) {
      void video.play()
      return
    }

    video.pause()
  }

  return (
    <section className="landing-video-section" id="contact" aria-label="Campus video section">
      <div className="landing-video-head">
        <p>Campus Feature</p>
        <h2>Campus Videos</h2>
      </div>

      <div className="landing-video-carousel">
        <div className="landing-video-carousel-top">
          <h3 className={`landing-carousel-title ${isTitleFading ? 'is-fading' : ''}`}>
            {activeVideo.title}
          </h3>

          <div className="landing-carousel-controls">
            <button
              type="button"
              className="landing-carousel-btn"
              onClick={() => goToSlide(activeVideoIndex - 1)}
              disabled={isTitleFading}
            >
              Prev
            </button>
            <span className="landing-carousel-count">
              {activeVideoIndex + 1} / {LANDING_VIDEOS.length}
            </span>
            <button
              type="button"
              className="landing-carousel-btn"
              onClick={() => goToSlide(activeVideoIndex + 1)}
              disabled={isTitleFading}
            >
              Next
            </button>
          </div>
        </div>

      <div
        className="landing-video-frame landing-video-interactive"
        role="button"
        tabIndex={0}
        aria-label={isVideoPlaying ? `Pause ${activeVideo.title}` : `Play ${activeVideo.title}`}
        onClick={togglePlayback}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            togglePlayback()
          }
        }}
      >
        <video
          key={currentVideoSrc}
          ref={videoRef}
          className="landing-video-player"
          poster={activeVideo.poster}
          preload="metadata"
          playsInline
          onError={() => {
            if (currentVideoSrc !== activeVideo.src) {
              setCurrentVideoSrc(activeVideo.src)
            }
          }}
          onPlay={() => setIsVideoPlaying(true)}
          onPause={() => setIsVideoPlaying(false)}
          onEnded={() => setIsVideoPlaying(false)}
        >
          <source src={currentVideoSrc} type="video/mp4" />
          Your browser does not support the video tag.
        </video>
        <button
          type="button"
          className={`landing-video-overlay-btn ${isVideoPlaying ? 'is-hidden' : ''}`}
          aria-label={`Play ${activeVideo.title}`}
          onClick={event => {
            event.stopPropagation()
            togglePlayback()
          }}
        >
          <span className="landing-video-play-icon" />
        </button>
      </div>

        <div className="landing-carousel-dots" aria-label="Video carousel navigation">
          {LANDING_VIDEOS.map((videoItem, index) => (
            <button
              key={videoItem.src}
              type="button"
              className={`landing-carousel-dot ${index === activeVideoIndex ? 'is-active' : ''}`}
              onClick={() => goToSlide(index)}
              aria-label={`Go to video ${index + 1}: ${videoItem.title}`}
              aria-current={index === activeVideoIndex ? 'true' : undefined}
              disabled={isTitleFading}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

export default function LandingPage({
  onOpenAbout,
  onOpenTermsPolicy,
  onOpenCookiePolicy,
  onOpenCookieSystem,
  onOpenSignIn,
  onOpenApplicantMaintenance
}: LandingPageProps) {
  const [theme, setTheme] = useState<ThemePreference>(() => getStoredTheme(null))
  const [isApplyModalOpen, setIsApplyModalOpen] = useState(false)

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

  const handleThemeChange = (nextTheme: ThemePreference) => {
    setTheme(nextTheme)
    applyThemePreference(nextTheme, { animate: true, scope: null })
  }

  useEffect(() => {
    if (!isApplyModalOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsApplyModalOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isApplyModalOpen])

  const handleOpenApplyModal = () => {
    setIsApplyModalOpen(true)
  }

  const handleCloseApplyModal = () => {
    setIsApplyModalOpen(false)
  }

  const handleSignIn = () => {
    setIsApplyModalOpen(false)
    onOpenSignIn()
  }

  const handleApplicantClick = () => {
    setIsApplyModalOpen(false)
    onOpenApplicantMaintenance()
  }

  return (
    <div className="landing-page">
      <header className="landing-navbar">
        <a href="#top" className="landing-nav-brand">
          <img src="/Logo.jpg" alt="West Coast College" className="landing-nav-logo" />
          <span>West Coast College</span>
        </a>
        <nav className="landing-nav-links" aria-label="Landing page navigation">
          <button type="button" className="landing-nav-link-btn" onClick={onOpenAbout}>
            About
          </button>
          <a href="#services">Services</a>
          <a href="#contact">Contact</a>
        </nav>
        <div className="landing-theme-picker">
          <label htmlFor="landing-theme-select" className="landing-theme-label">
            Theme
          </label>
          <select
            id="landing-theme-select"
            className="landing-theme-select"
            value={theme}
            onChange={event => handleThemeChange(event.target.value as ThemePreference)}
            aria-label="Theme mode selector"
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="auto">System Auto</option>
          </select>
        </div>
      </header>

      <div className="landing-shell">
        <section className="landing-content" id="top">
          <div className="landing-brand">
            <img src="/Logo.jpg" alt="West Coast College" className="landing-logo" />
            <p className="landing-kicker">West Coast College</p>
          </div>
          <h1 className="landing-title">A Developing Higher Education Institution in the Bicol Region</h1>
          <p className="landing-subtitle">
             Providing a digital enrollment platform that simplifies the process and makes it more accessible for students.
          </p>
          <div className="landing-hero-actions">
            <button type="button" className="landing-apply-btn" onClick={handleOpenApplyModal}>
              Apply Now
            </button>
          </div>
        </section>

        <aside className="landing-image-wrap" aria-label="Campus hero image">
          <img
            src="/logo-header.jpg"
            alt="West Coast College campus visual"
            className="landing-hero-image"
          />
        </aside>
      </div>

      <section className="landing-values" id="about" aria-label="Vision and mission section">
        <div className="landing-values-head">
          <p>Institution Direction</p>
          <h2>Vision And Mission</h2>
        </div>

        <div className="landing-values-grid">
          <article className="landing-value-card landing-value-card-vision">
            <p className="landing-value-eyebrow">Strategic Direction</p>
            <h3>Vision</h3>
            <p className="landing-value-summary">
              By providing quality education, the College envisions itself as an educational institution that would develop highly disciplined and professionally competent, appreciative-of-Filipino-culture individuals who would contribute to building a just and humane Philippine society.
            </p>
          </article>

          <article className="landing-value-card landing-value-card-mission">
            <p className="landing-value-eyebrow">Institutional Commitment</p>
            <h3>Mission</h3>
            <p className="landing-value-summary">
              West Coast College believes that all persons, regardless of status in life, are imbued with dignity and that all resources, whether personal or communal, should be harnessed to promote this dignity.
              The College commits itself to pursue relevant and responsive programs utilizing modern educational technology that would develop competent and ethical professionals dedicated to the advancement of knowledge, appreciative of arts and culture, and who provide meaningful leadership to their community and the Philippine society as a whole.
            </p>
            
          </article>
        </div>
      </section>

      <section className="landing-services" id="services" aria-label="Services section">
        <div className="landing-services-head">
          <p>Institutional Services</p>
          <h2>Student And School Services</h2>
        </div>

        <div className="landing-services-grid">
          <article className="landing-service-card">
            <p className="landing-service-kicker">01</p>
            <h3>Academic Programs</h3>
            <p className="landing-service-desc">
              West Coast College provides relevant higher education programs designed to build
              professional competence, academic excellence, and ethical leadership.
            </p>
          </article>

          <article className="landing-service-card">
            <p className="landing-service-kicker">02</p>
            <h3>Admissions and Registrar Services</h3>
            <p className="landing-service-desc">
              The institution supports students through admissions processing, enrollment guidance,
              records management, and issuance of official academic documents.
            </p>
          </article>

          <article className="landing-service-card">
            <p className="landing-service-kicker">03</p>
            <h3>Student Affairs and Support</h3>
            <p className="landing-service-desc">
              Student services include counseling, co-curricular activities, and campus support
              initiatives that promote student welfare and holistic development.
            </p>
          </article>

          <article className="landing-service-card">
            <p className="landing-service-kicker">04</p>
            <h3>Faculty and Staff Development</h3>
            <p className="landing-service-desc">
              West Coast College strengthens institutional quality through faculty training,
              administrative development, and continuous improvement of school services.
            </p>
          </article>
        </div>
      </section>

      <LandingVideoCarousel />

      {isApplyModalOpen && (
        <div
          className="landing-apply-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="landing-apply-modal-title"
          onClick={event => {
            if (event.target === event.currentTarget) {
              handleCloseApplyModal()
            }
          }}
        >
          <div className="landing-apply-modal-card">
            <button
              type="button"
              className="landing-apply-modal-close"
              onClick={handleCloseApplyModal}
              aria-label="Close apply options"
            >
              &times;
            </button>

            <div className="landing-apply-modal-brand">
              <img
                src="/Logo.jpg"
                alt="West Coast College"
                className="landing-apply-modal-logo"
              />
              <h3 id="landing-apply-modal-title">West Coast College</h3>
            </div>

            <p className="landing-apply-modal-desc">
              Choose how you want to continue
            </p>

            <div className="landing-apply-choice-list">
              <button
                type="button"
                className="landing-apply-choice-card landing-apply-choice-btn"
                onClick={handleSignIn}
              >
                <span className="landing-apply-choice-icon landing-apply-choice-icon-signin" aria-hidden="true">
                  <svg viewBox="0 0 24 24" focusable="false">
                    <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-3.3 0-6 1.8-6 4v1h12v-1c0-2.2-2.7-4-6-4Z" />
                  </svg>
                </span>
                <span className="landing-apply-choice-content">
                  <span className="landing-apply-choice-title">WCC Personnel &amp; Students</span>
                  <span className="landing-apply-choice-meta">Admin and account access</span>
                  <span className="landing-apply-choice-text">Sign in using your registered portal account</span>
                </span>
                <span className="landing-apply-choice-arrow" aria-hidden="true">
                  &gt;
                </span>
              </button>

              <button
                type="button"
                className="landing-apply-choice-card landing-apply-choice-btn"
                onClick={handleApplicantClick}
              >
                <span className="landing-apply-choice-icon landing-apply-choice-icon-apply" aria-hidden="true">
                  <svg viewBox="0 0 24 24" focusable="false">
                    <path d="M7 4h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm0 2v12h10V6Zm2 2h6v2H9Zm0 4h6v2H9Z" />
                  </svg>
                </span>
                <span className="landing-apply-choice-content">
                  <span className="landing-apply-choice-title">Applicants</span>
                  <span className="landing-apply-choice-meta">Admissions and enrollment inquiry</span>
                  <span className="landing-apply-choice-text">Apply in school and coordinate with Software Support</span>
                </span>
                <span className="landing-apply-choice-arrow" aria-hidden="true">
                  &gt;
                </span>
              </button>
            </div>

            <div className="landing-apply-modal-footer-links">
              <p>
                New applicant?{' '}
                <a href="mailto:westcoastcollegeregistrar@gmail.com?subject=New%20Applicant%20Registration%20Inquiry">
                  Register here
                </a>
              </p>
              <p>
                Need assistance?{' '}
                <a href="mailto:westcoastcollegeregistrar@gmail.com?subject=Software%20Support%20Inquiry%20-%20West%20Coast%20College">
                  Contact Software Support
                </a>
              </p>
            </div>
          </div>
        </div>
      )}

      <footer className="landing-footer" aria-label="Landing page footer">
        <div className="landing-footer-brand">
          <img src="/Logo.jpg" alt="West Coast College" className="landing-footer-logo" />
          <div>
            <h3>West Coast College</h3>
            <p>Accessible, quality, and student-centered digital services.</p>
          </div>
        </div>

        <div className="landing-footer-links">
          <h4>Quick Links</h4>
          <a href="#top">Home</a>
          <a href="#about">Vision &amp; Mission</a>
          <a href="#contact">Campus Video</a>
          <button
            type="button"
            className="landing-footer-cookie-link"
            onClick={onOpenCookieSystem}
          >
            Cookie Settings
          </button>
        </div>

        <div className="landing-footer-contact">
          <h4>Contact</h4>
          <a href="tel:+639778276806" className="landing-footer-contact-link">
            0977 827 6806
          </a>
          <a
            href="mailto:westcoastcollegeregistrar@gmail.com"
            className="landing-footer-contact-link"
          >
            westcoastcollegeregistrar@gmail.com
          </a>
          <a
            href="mailto:westcoastcollegeregistrar@gmail.com?subject=West%20Coast%20College%20Inquiry"
            className="landing-footer-contact-cta"
          >
            Contact Us
          </a>
          <p>West Coast College</p>
        </div>

        <div className="landing-footer-bottom" aria-label="Footer policies">
          <button
            type="button"
            className="landing-footer-bottom-link landing-footer-bottom-btn"
            onClick={onOpenTermsPolicy}
          >
            Terms &amp; Policy
          </button>
          <span className="landing-footer-separator">|</span>
          <button
            type="button"
            className="landing-footer-bottom-link landing-footer-bottom-btn"
            onClick={onOpenCookiePolicy}
          >
            Cookie Policy
          </button>
          <span className="landing-footer-separator">|</span>
          <button
            type="button"
            className="landing-footer-bottom-link landing-footer-bottom-btn"
            onClick={onOpenCookieSystem}
          >
            Cookie System
          </button>
          <span className="landing-footer-copyright">
            &copy; 2026 West Coast College All rights reserved
          </span>
        </div>
      </footer>
    </div>
  )
}

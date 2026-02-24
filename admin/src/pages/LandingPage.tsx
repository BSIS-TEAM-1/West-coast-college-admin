import { useEffect, useRef, useState } from 'react'
import './LandingPage.css'
import {
  applyThemePreference,
  getStoredTheme,
  setActiveThemeScope,
  type ThemePreference
} from '../lib/theme'

type LandingPageProps = {
  onOpenStaffLogin: () => void
}

type LandingVideoItem = {
  title: string
  src: string
  optimizedSrc: string
}

const LANDING_VIDEOS: LandingVideoItem[] = [
  {
    title: '2024 SHS Graduation Ceremony',
    src: '/2024SHSintrovid.mp4',
    optimizedSrc: '/videos/2024SHSintrovid.mp4'
  },
  {
    title: '2024 Graduation Ceremony',
    src: '/2024introvid.mp4',
    optimizedSrc: '/videos/2024introvid.mp4'
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

export default function LandingPage({ onOpenStaffLogin }: LandingPageProps) {
  const [theme, setTheme] = useState<ThemePreference>(() => getStoredTheme(null))
  const [isCookieSettingsOpen, setIsCookieSettingsOpen] = useState(false)

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
    if (!isCookieSettingsOpen) return

    const previousOverflow = document.body.style.overflow
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsCookieSettingsOpen(false)
      }
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleEscape)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleEscape)
    }
  }, [isCookieSettingsOpen])

  return (
    <div className="landing-page">
      <header className="landing-navbar">
        <a href="#top" className="landing-nav-brand">
          <img src="/Logo.jpg" alt="West Coast College" className="landing-nav-logo" />
          <span>West Coast College</span>
        </a>
        <nav className="landing-nav-links" aria-label="Landing page navigation">
          <a href="#about">About</a>
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
        
        </section>

        <aside className="landing-image-wrap" aria-label="Campus hero image">
          <img
            src="landingpage-intropic.png"
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

          <article className="landing-value-card landing-value-card-mission" id="services">
            <p className="landing-value-eyebrow">Institutional Commitment</p>
            <h3>Mission</h3>
            <p className="landing-value-summary">
              West Coast College believes that all persons, regardless of status in life, are imbued with dignity and that all resources, whether personal or communal, should be harnessed to promote this dignity.
              The College commits itself to pursue relevant and responsive programs utilizing modern educational technology that would develop competent and ethical professionals dedicated to the advancement of knowledge, appreciative of arts and culture, and who provide meaningful leadership to their community and the Philippine society as a whole.
            </p>
            
          </article>
        </div>
      </section>

      <LandingVideoCarousel />

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
            onClick={() => setIsCookieSettingsOpen(true)}
          >
            Cookie Settings
          </button>
        </div>

        <div className="landing-footer-contact">
          <h4>Contact</h4>
          <a href="tel:+639778276806" className="landing-footer-contact-link">
            0977 827 6806
          </a>
          <a href="mailto:wcc.theregistrar@gmail.com" className="landing-footer-contact-link">
            wcc.theregistrar@gmail.com
          </a>
          <p>West Coast College</p>
          <button type="button" className="landing-footer-btn" onClick={onOpenStaffLogin}>
            Staff Login
          </button>
        </div>
      </footer>
    </div>
  )
}

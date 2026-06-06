import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type TouchEvent } from 'react'
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
  onOpenCollaborators: () => void
  onOpenSignIn: () => void
  onOpenApplicantPortal: () => void
}

type LandingVideoItem = {
  title: string
  src: string
  optimizedSrc: string
  poster?: string
}

type LandingNavItem = 'home' | 'admissions' | 'programs' | 'campus' | 'about' | 'contact'

type TeacherProgramItem = {
  code: string
  title: string
  description: string
}

const TEACHER_PROGRAMS: TeacherProgramItem[] = [
  {
    code: 'BEED',
    title: 'Bachelor of Elementary Education',
    description: 'Prepares future elementary teachers with strong foundations in child-centered instruction, classroom management, and values-driven learning.'
  },
  {
    code: 'BSEd English',
    title: 'Bachelor of Secondary Education - English',
    description: 'Develops communication-focused educators who can teach language, literature, reading, and critical expression in secondary classrooms.'
  },
  {
    code: 'BSEd Mathematics',
    title: 'Bachelor of Secondary Education - Mathematics',
    description: 'Builds confident mathematics teachers through analytical thinking, problem solving, and practical strategies for teaching secondary learners.'
  }
]

const LANDING_VIDEOS: LandingVideoItem[] = [
  {
    title: '2024 SHS Graduation Ceremony',
    src: '/2024SHSintrovid.mp4',
    optimizedSrc: '/2024SHSintrovid.mp4',
    poster: '/intro-img1.png'
  },
  {
    title: '2024 Graduation Ceremony',
    src: '/2024introvid.mp4',
    optimizedSrc: '/2024introvid.mp4',
    poster: '/intro-img2.png'
  },
  {
    title: 'Video Premiere "West Coast College"',
    src: '/landingpagevideo.mp4',
    optimizedSrc: '/landingpagevideo.mp4',
    poster: '/logo-bg-removed.png'
  }
]

const TITLE_FADE_MS = 220
const VIDEO_SWIPE_THRESHOLD_PX = 56

function formatVideoTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00'

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.floor(seconds % 60)
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
}

function LandingVideoCarousel() {
  const useOptimizedSourceByDefault = import.meta.env.PROD
  const [activeVideoIndex, setActiveVideoIndex] = useState(0)
  const [isVideoPlaying, setIsVideoPlaying] = useState(false)
  const [isTitleFading, setIsTitleFading] = useState(false)
  const [videoCurrentTime, setVideoCurrentTime] = useState(0)
  const [videoDuration, setVideoDuration] = useState(0)
  const [currentVideoSrc, setCurrentVideoSrc] = useState<string>(() =>
    useOptimizedSourceByDefault ? LANDING_VIDEOS[0].optimizedSrc : LANDING_VIDEOS[0].src
  )
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const fadeTimeoutRef = useRef<number | null>(null)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const suppressPlaybackToggleRef = useRef(false)

  const activeVideo = LANDING_VIDEOS[activeVideoIndex]
  const expectedDefaultSrc = useOptimizedSourceByDefault
    ? activeVideo.optimizedSrc
    : activeVideo.src
  const videoProgressPercent = videoDuration > 0
    ? Math.min(100, Math.max(0, (videoCurrentTime / videoDuration) * 100))
    : 0

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
    setVideoCurrentTime(0)
    setVideoDuration(0)
    setIsTitleFading(true)

    fadeTimeoutRef.current = window.setTimeout(() => {
      setActiveVideoIndex(normalizedIndex)
      window.requestAnimationFrame(() => setIsTitleFading(false))
      fadeTimeoutRef.current = null
    }, TITLE_FADE_MS)
  }

  const togglePlayback = () => {
    if (suppressPlaybackToggleRef.current) {
      suppressPlaybackToggleRef.current = false
      return
    }

    const video = videoRef.current
    if (!video) return

    if (video.paused || video.ended) {
      void video.play()
      return
    }

    video.pause()
  }

  const handleVideoTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    const touch = event.changedTouches[0]
    touchStartRef.current = { x: touch.clientX, y: touch.clientY }
    suppressPlaybackToggleRef.current = false
  }

  const handleVideoTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const touchStart = touchStartRef.current
    touchStartRef.current = null
    if (!touchStart || isTitleFading) return

    const touch = event.changedTouches[0]
    const deltaX = touch.clientX - touchStart.x
    const deltaY = touch.clientY - touchStart.y

    if (Math.abs(deltaX) < VIDEO_SWIPE_THRESHOLD_PX || Math.abs(deltaX) <= Math.abs(deltaY)) {
      return
    }

    suppressPlaybackToggleRef.current = true
    goToSlide(deltaX < 0 ? activeVideoIndex + 1 : activeVideoIndex - 1)
  }

  const handleVideoKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      togglePlayback()
    }
  }

  const updateVideoProgress = () => {
    const video = videoRef.current
    if (!video) return

    setVideoCurrentTime(video.currentTime || 0)
    setVideoDuration(Number.isFinite(video.duration) ? video.duration : 0)
  }

  const handleProgressClick = (event: MouseEvent<HTMLDivElement>) => {
    event.stopPropagation()

    const video = videoRef.current
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return

    const progressBounds = event.currentTarget.getBoundingClientRect()
    const clickRatio = Math.min(1, Math.max(0, (event.clientX - progressBounds.left) / progressBounds.width))
    const nextTime = clickRatio * video.duration

    video.currentTime = nextTime
    setVideoCurrentTime(nextTime)
  }

  const seekVideoTo = (nextTime: number) => {
    const video = videoRef.current
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return

    const boundedTime = Math.min(video.duration, Math.max(0, nextTime))
    video.currentTime = boundedTime
    setVideoCurrentTime(boundedTime)
  }

  const handleProgressKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!videoDuration) return

    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      seekVideoTo(videoCurrentTime - 5)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      seekVideoTo(videoCurrentTime + 5)
    } else if (event.key === 'Home') {
      event.preventDefault()
      seekVideoTo(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      seekVideoTo(videoDuration)
    }
  }

  return (
    <section className="landing-video-section" id="contact" aria-label="Campus video section">
      <div className="container landing-container py-4 py-lg-5">
        <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-end gap-3 mb-4">
          <div>
            <span className="landing-section-kicker">Campus Feature</span>
            <h2 className="landing-section-title mt-1 mb-1">Campus Videos</h2>
            <p className={`landing-video-active-title ${isTitleFading ? 'is-fading' : ''}`}>
              {activeVideo.title}
            </p>
          </div>

          <div className="landing-video-controls d-flex align-items-center gap-3">
            <button
              type="button"
              className="landing-square-btn btn"
              onClick={() => goToSlide(activeVideoIndex - 1)}
              disabled={isTitleFading}
              aria-label="Previous video"
            >
              <span className="material-symbols-outlined" aria-hidden="true">chevron_left</span>
            </button>
            <span className="landing-carousel-count">
              {activeVideoIndex + 1} / {LANDING_VIDEOS.length}
            </span>
            <button
              type="button"
              className="landing-square-btn landing-square-btn-primary btn"
              onClick={() => goToSlide(activeVideoIndex + 1)}
              disabled={isTitleFading}
              aria-label="Next video"
            >
              <span className="material-symbols-outlined" aria-hidden="true">chevron_right</span>
            </button>
          </div>
        </div>

        <div
          className="landing-video-frame landing-video-interactive"
          role="button"
          tabIndex={0}
          aria-label={isVideoPlaying ? `Pause ${activeVideo.title}` : `Play ${activeVideo.title}`}
          onClick={togglePlayback}
          onTouchStart={handleVideoTouchStart}
          onTouchEnd={handleVideoTouchEnd}
          onKeyDown={handleVideoKeyDown}
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
            onEnded={() => {
              setIsVideoPlaying(false)
              updateVideoProgress()
            }}
            onLoadedMetadata={updateVideoProgress}
            onTimeUpdate={updateVideoProgress}
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
            <span className="material-symbols-outlined" aria-hidden="true">play_arrow</span>
          </button>

          <div className="landing-video-bottom-bar" onClick={event => event.stopPropagation()}>
            <button
              type="button"
              className="landing-video-inline-btn"
              onClick={togglePlayback}
              aria-label={isVideoPlaying ? 'Pause video' : 'Play video'}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                {isVideoPlaying ? 'pause' : 'play_arrow'}
              </span>
            </button>
            <div
              className="landing-video-progress"
              role="slider"
              aria-label="Video progress"
              aria-valuemin={0}
              aria-valuemax={Math.max(0, Math.floor(videoDuration))}
              aria-valuenow={Math.floor(videoCurrentTime)}
              tabIndex={0}
              onClick={handleProgressClick}
              onKeyDown={handleProgressKeyDown}
            >
              <span style={{ width: `${videoProgressPercent}%` }} />
            </div>
            <span className="landing-video-time">
              {formatVideoTime(videoCurrentTime)} / {formatVideoTime(videoDuration)}
            </span>
          </div>
        </div>

        <p className="landing-carousel-swipe-hint">Swipe left or right on the video to switch clips.</p>

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
  onOpenCollaborators,
  onOpenSignIn,
  onOpenApplicantPortal
}: LandingPageProps) {
  const [theme, setTheme] = useState<ThemePreference>(() => getStoredTheme(null))
  const [isApplyModalOpen, setIsApplyModalOpen] = useState(false)
  const [isFooterContactHighlighted, setIsFooterContactHighlighted] = useState(false)
  const [isNavOpen, setIsNavOpen] = useState(false)
  const [activeNavItem, setActiveNavItem] = useState<LandingNavItem>('home')
  const [activeTeacherProgramIndex, setActiveTeacherProgramIndex] = useState(0)
  const footerContactRef = useRef<HTMLDivElement | null>(null)
  const footerContactHighlightTimeoutRef = useRef<number | null>(null)
  const activeTeacherProgram = TEACHER_PROGRAMS[activeTeacherProgramIndex]

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
    if (!isApplyModalOpen) return

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsApplyModalOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isApplyModalOpen])

  useEffect(() => {
    if (!isNavOpen) return

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsNavOpen(false)
      }
    }

    document.body.classList.add('landing-drawer-open')
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.classList.remove('landing-drawer-open')
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isNavOpen])

  useEffect(() => {
    return () => {
      if (footerContactHighlightTimeoutRef.current !== null) {
        window.clearTimeout(footerContactHighlightTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveTeacherProgramIndex(previous => (previous + 1) % TEACHER_PROGRAMS.length)
    }, 4200)

    return () => window.clearInterval(timer)
  }, [])

  const handleThemeChange = (nextTheme: ThemePreference) => {
    setTheme(nextTheme)
    applyThemePreference(nextTheme, { animate: true, scope: null })
  }

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
    onOpenApplicantPortal()
  }

  const triggerFooterContactHighlight = () => {
    if (footerContactHighlightTimeoutRef.current !== null) {
      window.clearTimeout(footerContactHighlightTimeoutRef.current)
    }

    setIsFooterContactHighlighted(false)

    window.requestAnimationFrame(() => {
      setIsFooterContactHighlighted(true)
      footerContactHighlightTimeoutRef.current = window.setTimeout(() => {
        setIsFooterContactHighlighted(false)
        footerContactHighlightTimeoutRef.current = null
      }, 5200)
    })
  }

  const handleFooterContactClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    setActiveNavItem('contact')
    setIsNavOpen(false)
    footerContactRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    window.history.replaceState({}, '', '#footer-contact')
    triggerFooterContactHighlight()
  }

  const handleSectionLinkClick = (navItem: LandingNavItem) => {
    setActiveNavItem(navItem)
    setIsNavOpen(false)
  }

  const handleAboutClick = () => {
    setActiveNavItem('about')
    setIsNavOpen(false)
    onOpenAbout()
  }

  const toggleDarkLightTheme = () => {
    handleThemeChange(theme === 'dark' ? 'light' : 'dark')
  }

  const displayedTheme = theme === 'auto' ? 'Auto' : theme === 'dark' ? 'Dark' : 'Light'

  return (
    <div className="landing-page">
      <nav className="landing-navbar navbar navbar-expand-lg sticky-top">
        <div className="container landing-container">
          <a className="navbar-brand landing-brand" href="#top" onClick={() => handleSectionLinkClick('home')}>
            <img src="/logo-bg-removed.png" alt="West Coast College Logo" className="landing-brand-logo" />
            <span>West Coast College</span>
          </a>

          <button
            className="navbar-toggler landing-navbar-toggler"
            type="button"
            aria-controls="landingNavbar"
            aria-expanded={isNavOpen}
            aria-label="Toggle navigation"
            onClick={() => setIsNavOpen(previous => !previous)}
          >
            <span className="material-symbols-outlined" aria-hidden="true">menu</span>
          </button>

          <button
            type="button"
            className={`landing-mobile-backdrop ${isNavOpen ? 'is-open' : ''}`}
            aria-label="Close navigation"
            onClick={() => setIsNavOpen(false)}
          />

          <div className={`collapse navbar-collapse landing-nav-panel ${isNavOpen ? 'show is-open' : ''}`} id="landingNavbar">
            <div className="landing-drawer-head">
              <div className="landing-drawer-brand">
                <img src="/logo-bg-removed.png" alt="" aria-hidden="true" />
                <span>Menu</span>
              </div>
              <button
                type="button"
                className="landing-drawer-close"
                aria-label="Close navigation"
                onClick={() => setIsNavOpen(false)}
              >
                <span className="material-symbols-outlined" aria-hidden="true">close</span>
              </button>
            </div>

            <ul className="navbar-nav landing-nav-links mx-md-auto">
              <li className="nav-item">
                <a
                  className={`nav-link ${activeNavItem === 'home' ? 'active' : ''}`}
                  href="#top"
                  onClick={() => handleSectionLinkClick('home')}
                  aria-current={activeNavItem === 'home' ? 'page' : undefined}
                >
                  Home
                </a>
              </li>
              <li className="nav-item">
                <a
                  className={`nav-link ${activeNavItem === 'admissions' ? 'active' : ''}`}
                  href="#admissions"
                  onClick={() => handleSectionLinkClick('admissions')}
                  aria-current={activeNavItem === 'admissions' ? 'page' : undefined}
                >
                  Admissions
                </a>
              </li>
              <li className="nav-item">
                <a
                  className={`nav-link ${activeNavItem === 'programs' ? 'active' : ''}`}
                  href="#programs"
                  onClick={() => handleSectionLinkClick('programs')}
                  aria-current={activeNavItem === 'programs' ? 'page' : undefined}
                >
                  Programs
                </a>
              </li>
              <li className="nav-item">
                <a
                  className={`nav-link ${activeNavItem === 'campus' ? 'active' : ''}`}
                  href="#campus-life"
                  onClick={() => handleSectionLinkClick('campus')}
                  aria-current={activeNavItem === 'campus' ? 'page' : undefined}
                >
                  Campus Life
                </a>
              </li>
              <li className="nav-item">
                <button
                  type="button"
                  className={`nav-link landing-nav-button ${activeNavItem === 'about' ? 'active' : ''}`}
                  onClick={handleAboutClick}
                  aria-current={activeNavItem === 'about' ? 'page' : undefined}
                >
                  About
                </button>
              </li>
              <li className="nav-item">
                <a
                  className={`nav-link ${activeNavItem === 'contact' ? 'active' : ''}`}
                  href="#footer-contact"
                  onClick={handleFooterContactClick}
                  aria-current={activeNavItem === 'contact' ? 'page' : undefined}
                >
                  Contact
                </a>
              </li>
            </ul>

            <div className="landing-theme-tools">
              <div className="landing-theme-picker">
                <span>Theme</span>
                <select
                  className="landing-theme-select"
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
                className="landing-theme-icon-btn"
                onClick={toggleDarkLightTheme}
                aria-label={`Current theme: ${displayedTheme}`}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  {theme === 'dark' ? 'light_mode' : 'dark_mode'}
                </span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main>
        <section className="landing-hero" id="top">
          <div className="landing-hero-glow" aria-hidden="true" />
          <div className="container landing-container position-relative">
            <div className="row align-items-center g-5">
              <div className="col-lg-6 text-white">
                <span className="landing-hero-kicker">Since 2000</span>
                <h1 className="landing-hero-title">
                  Empowering Future Leaders Through <span>Quality Education</span>
                </h1>
                <p className="landing-hero-copy">
                  West Coast College blends classroom excellence, student support, and a real campus
                  community to help learners take the next confident step toward their future.
                </p>
                <div className="landing-hero-actions">
                  <button type="button" className="landing-gold-btn btn" onClick={handleOpenApplyModal}>
                    Apply Now
                  </button>
                  <a className="landing-outline-btn btn" href="#programs" onClick={() => handleSectionLinkClick('programs')}>
                    Explore Programs
                  </a>
                </div>
              </div>

              <div className="col-lg-6">
                <div className="landing-campus-visual">
                  <img src="/schoolLogo1.png" alt="West Coast College campus buildings" />
                  <div className="landing-campus-overlay" aria-hidden="true" />
                  <div className="landing-campus-seal">
                    <img src="/logo-bg-removed.png" alt="" aria-hidden="true" />
                    <span>West Coast College</span>
                  </div>
                  <div className="landing-hero-stat landing-hero-stat-secondary">
                    <strong>CHED</strong>
                    <span>Recognized</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-values" id="about" aria-label="Why choose West Coast College">
          <div className="container landing-container py-4 py-lg-5">
            <div className="landing-section-head text-center mx-auto mb-5">
              <span className="landing-section-kicker">Why Choose West Coast College</span>
              <h2 className="landing-section-title mt-2 mb-3">A Campus Built Around Student Success</h2>
              <div className="landing-title-rule mx-auto" />
              <p>
                Students learn in an environment that combines academic discipline, practical support,
                and accessible digital services from application to graduation.
              </p>
            </div>

            <div className="row g-4 align-items-stretch">
              <div className="col-md-4">
                <article className="landing-value-card landing-value-card-light h-100">
                  <div className="d-flex align-items-center gap-3 mb-4">
                    <span className="material-symbols-outlined landing-value-icon" aria-hidden="true">school</span>
                    <h3>Quality Instruction</h3>
                  </div>
                  <p>
                    Programs are shaped to build professional competence, discipline, and ethical
                    leadership for the Bicol region and beyond.
                  </p>
                </article>
              </div>

              <div className="col-md-4">
                <article className="landing-value-card landing-value-card-dark h-100">
                  <div className="d-flex align-items-center gap-3 mb-4">
                    <span className="material-symbols-outlined landing-value-icon" aria-hidden="true">support_agent</span>
                    <h3>Student Support</h3>
                  </div>
                  <p>
                    Admissions, registrar services, student affairs, and digital tools work together
                    to make the academic journey clearer and more accessible.
                  </p>
                </article>
              </div>

              <div className="col-md-4">
                <article className="landing-value-card landing-value-card-light h-100">
                  <div className="d-flex align-items-center gap-3 mb-4">
                    <span className="material-symbols-outlined landing-value-icon" aria-hidden="true">workspace_premium</span>
                    <h3>Career Direction</h3>
                  </div>
                  <p>
                    Learning experiences are connected to real career goals, helping students build
                    confidence before they step into professional life.
                  </p>
                </article>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-services" id="programs" aria-label="Featured programs section">
          <div className="container landing-container py-4 py-lg-5">
            <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-end gap-3 mb-5">
              <div>
                <span className="landing-section-kicker">Featured Programs</span>
                <h2 className="landing-section-title">Academic Pathways With Purpose</h2>
              </div>
              <a className="landing-view-link" href="#footer-contact" onClick={handleFooterContactClick}>
                Ask Admissions
                <span className="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
              </a>
            </div>

            <div className="row g-4">
              <div className="col-lg-7">
                <article className="landing-service-card landing-service-card-large landing-teacher-carousel-card h-100">
                  <span className="landing-service-watermark">01</span>
                  <div className="landing-teacher-carousel-head">
                    <div>
                      <span className="landing-program-label">Teacher Education</span>
                      <h3>{activeTeacherProgram.code}</h3>
                    </div>
                  </div>
                  <div className="landing-teacher-carousel-viewport" aria-live="polite">
                    <div
                      className="landing-teacher-carousel-track"
                      style={{ transform: `translateX(-${activeTeacherProgramIndex * 100}%)` }}
                    >
                      {TEACHER_PROGRAMS.map((program) => (
                        <div className="landing-teacher-carousel-body" key={program.code}>
                          <strong>{program.title}</strong>
                          <p>{program.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="landing-teacher-carousel-dots" aria-label="Teacher education programs">
                    {TEACHER_PROGRAMS.map((program, index) => (
                      <button
                        key={program.code}
                        type="button"
                        className={index === activeTeacherProgramIndex ? 'is-active' : ''}
                        disabled
                        aria-label={`Show ${program.code}`}
                        aria-current={index === activeTeacherProgramIndex ? 'true' : undefined}
                      />
                    ))}
                  </div>
                </article>
              </div>

              <div className="col-lg-5">
                <article className="landing-service-card landing-service-card-primary h-100">
                  <span>02</span>
                  <h3>Business Administration</h3>
                  <p>
                    Develop operational, service, and management skills for careers in hospitality,
                    business, and people-centered organizations.
                  </p>
                </article>
              </div>

              <div className="col-lg-5">
                <article className="landing-service-card landing-service-card-outline h-100">
                  <span>03</span>
                  <h3>Senior High School</h3>
                  <p>
                    Prepare for college with a learning environment that supports academic readiness,
                    discipline, and future planning.
                  </p>
                </article>
              </div>

              <div className="col-lg-7">
                <article className="landing-service-card landing-service-card-soft h-100">
                  <div className="row g-4 align-items-start">
                    <div className="col-sm-8">
                      <span>04</span>
                      <h3>Registrar and Digital Services</h3>
                      <p>
                        Online application, enrollment support, document assistance, and academic
                        records services help students move through school requirements with less friction.
                      </p>
                    </div>
                    <div className="col-sm-4 text-sm-end">
                      <span className="material-symbols-outlined landing-service-big-icon" aria-hidden="true">groups</span>
                    </div>
                  </div>
                </article>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-campus-life" id="campus-life" aria-label="Campus life preview">
          <div className="container landing-container py-4 py-lg-5">
            <div className="row g-4 align-items-center">
              <div className="col-lg-6">
                <img src="/intro-img2.png" alt="West Coast College campus event" className="landing-campus-life-img" />
              </div>
              <div className="col-lg-6">
                <span className="landing-section-kicker">Campus Life</span>
                <h2 className="landing-section-title mt-2">A Real Campus Community</h2>
                <p className="landing-campus-life-copy">
                  From classroom learning to school events and student services, West Coast College
                  gives students a place to belong, participate, and grow with confidence.
                </p>
                <div className="landing-campus-points">
                  <span>Student activities</span>
                  <span>Guidance and support</span>
                  <span>Campus events</span>
                  <span>Digital services</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-testimonials" aria-label="Student testimonials and announcements">
          <div className="container landing-container py-4 py-lg-5">
            <div className="landing-section-head mx-auto text-center mb-5">
              <span className="landing-section-kicker">Student Voices</span>
              <h2 className="landing-section-title mt-2">Confidence Starts With the Right Support</h2>
            </div>
            <div className="row g-4">
              <div className="col-lg-4">
                <article className="landing-testimonial-card h-100">
                  <p>"The enrollment process is easier to follow, and the staff guide us through every requirement."</p>
                  <strong>Incoming College Student</strong>
                </article>
              </div>
              <div className="col-lg-4">
                <article className="landing-testimonial-card h-100">
                  <p>"West Coast College feels personal. You can ask for help and know where to go next."</p>
                  <strong>Education Student</strong>
                </article>
              </div>
              <div className="col-lg-4">
                <article className="landing-news-card h-100">
                  <span className="landing-section-kicker">News &amp; Announcements</span>
                  <h3>Admissions and campus updates are posted through the student portal.</h3>
                  <a href="#footer-contact" onClick={handleFooterContactClick}>Contact Admissions</a>
                </article>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-enrollment" id="admissions" aria-label="Enrollment process">
          <div className="container landing-container py-4 py-lg-5">
            <div className="landing-section-head text-center mx-auto mb-5">
              <span className="landing-section-kicker">Enrollment Process</span>
              <h2 className="landing-section-title mt-2">A Clear Path From Inquiry to Enrollment</h2>
            </div>
            <div className="landing-enrollment-steps">
              <article>
                <span>01</span>
                <h3>Choose a Program</h3>
                <p>Explore the academic pathway that matches your interests and career direction.</p>
              </article>
              <article>
                <span>02</span>
                <h3>Submit Application</h3>
                <p>Use the applicant portal or contact admissions for guided registration support.</p>
              </article>
              <article>
                <span>03</span>
                <h3>Confirm Requirements</h3>
                <p>Coordinate with registrar services for records, verification, and enrollment steps.</p>
              </article>
              <article>
                <span>04</span>
                <h3>Start Classes</h3>
                <p>Join your block, meet your instructors, and begin your West Coast College journey.</p>
              </article>
            </div>
          </div>
        </section>

        <LandingVideoCarousel />
      </main>

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
              className="landing-apply-modal-close btn-close"
              onClick={handleCloseApplyModal}
              aria-label="Close apply options"
            />

            <div className="landing-apply-modal-brand">
              <img src="/Logo.jpg" alt="West Coast College" className="landing-apply-modal-logo" />
              <h3 id="landing-apply-modal-title">West Coast College</h3>
            </div>

            <p className="landing-apply-modal-desc">Choose how you want to continue</p>

            <div className="landing-apply-choice-list">
              <button type="button" className="landing-apply-choice-card" onClick={handleSignIn}>
                <span className="landing-apply-choice-icon" aria-hidden="true">
                  <span className="material-symbols-outlined">person</span>
                </span>
                <span className="landing-apply-choice-content">
                  <span className="landing-apply-choice-title">WCC Personnel &amp; Students</span>
                  <span className="landing-apply-choice-meta">Admin and account access</span>
                  <span className="landing-apply-choice-text">Sign in using your registered portal account</span>
                </span>
                <span className="landing-apply-choice-arrow material-symbols-outlined" aria-hidden="true">
                  chevron_right
                </span>
              </button>

              <button type="button" className="landing-apply-choice-card" onClick={handleApplicantClick}>
                <span className="landing-apply-choice-icon landing-apply-choice-icon-gold" aria-hidden="true">
                  <span className="material-symbols-outlined">assignment</span>
                </span>
                <span className="landing-apply-choice-content">
                  <span className="landing-apply-choice-title">Applicants</span>
                  <span className="landing-apply-choice-meta">Online admissions onboarding</span>
                  <span className="landing-apply-choice-text">Submit your application details to the registrar</span>
                </span>
                <span className="landing-apply-choice-arrow material-symbols-outlined" aria-hidden="true">
                  chevron_right
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
        <div className="container landing-container">
          <div className="row g-5 mb-5">
            <div className="col-lg-4">
              <div className="landing-footer-brand">
                <img src="/logo-bg-removed.png" alt="West Coast College" />
                <h3>West Coast College</h3>
              </div>
              <p className="landing-footer-copy">
                Accessible, quality, and student-centered digital services. Shaping the future of
                Bicol's education through technology and tradition.
              </p>
            </div>

            <div className="col-lg-4 ps-lg-5">
              <h4>Quick Links</h4>
              <div className="row g-3">
                <div className="col-6">
                  <ul className="landing-footer-link-list">
                    <li><a href="#top">Home</a></li>
                    <li><a href="#contact">Campus Video</a></li>
                    <li><button type="button" onClick={onOpenCookieSystem}>Cookie Settings</button></li>
                  </ul>
                </div>
                <div className="col-6">
                  <ul className="landing-footer-link-list">
                    <li><a href="#about">Vision &amp; Mission</a></li>
                    <li><button type="button" onClick={onOpenCollaborators}>Collaborators</button></li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="col-lg-4 ps-lg-5" ref={footerContactRef} id="footer-contact">
              <h4>Contact</h4>
              <ul className="landing-contact-list">
                <li>
                  <span className="material-symbols-outlined" aria-hidden="true">call</span>
                  <a href="tel:+639778276806">0977 827 6806</a>
                </li>
                <li>
                  <span className="material-symbols-outlined" aria-hidden="true">mail</span>
                  <a href="mailto:westcoastcollegeregistrar@gmail.com">westcoastcollegeregistrar@gmail.com</a>
                </li>
                <li>
                  <span className="material-symbols-outlined" aria-hidden="true">location_on</span>
                  <span>West Coast College, Bicol Region</span>
                </li>
              </ul>
              <a
                href="mailto:westcoastcollegeregistrar@gmail.com?subject=West%20Coast%20College%20Inquiry"
                className={`landing-footer-contact-cta ${isFooterContactHighlighted ? 'is-highlighted' : ''}`}
              >
                Contact Us
              </a>
            </div>
          </div>

          <div className="landing-footer-bottom">
            <p>&copy; 2026 West Coast College All rights reserved</p>
            <div>
              <button type="button" onClick={onOpenTermsPolicy}>Terms &amp; Policy</button>
              <button type="button" onClick={onOpenCookiePolicy}>Cookie Policy</button>
              <button type="button" onClick={onOpenCookieSystem}>Cookie System</button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

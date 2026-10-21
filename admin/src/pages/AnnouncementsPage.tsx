import { useEffect, useMemo, useState } from 'react'
import { API_URL } from '../lib/authApi'
import {
  getAnnouncementAudienceLabels,
} from '../lib/announcementAudience'
import {
  applyThemePreference,
  getStoredTheme,
  setActiveThemeScope,
  type ThemePreference,
} from '../lib/theme'
import './AnnouncementsPage.css'

type AnnouncementsPageProps = {
  onBack: () => void
}

type PublicAnnouncementMedia = {
  type: 'image' | 'video'
  url: string
  fileName?: string
  originalFileName?: string
  mimeType?: string
  caption?: string
}

type PublicAnnouncement = {
  _id: string
  title: string
  message: string
  type: 'info' | 'warning' | 'urgent' | 'maintenance'
  targetAudience?: unknown
  isPinned?: boolean
  expiresAt?: string
  createdAt: string
  createdBy?: {
    username?: string
    displayName?: string
  }
  media?: PublicAnnouncementMedia[]
}

const TYPE_FILTERS = ['all', 'info', 'warning', 'urgent', 'maintenance'] as const
type TypeFilter = (typeof TYPE_FILTERS)[number]

const TYPE_META: Record<PublicAnnouncement['type'], { label: string; icon: string }> = {
  info: { label: 'Info', icon: 'info' },
  warning: { label: 'Warning', icon: 'warning' },
  urgent: { label: 'Urgent', icon: 'priority_high' },
  maintenance: { label: 'Maintenance', icon: 'build' },
}

function formatDate(dateString?: string) {
  if (!dateString) return ''
  const date = new Date(dateString)
  if (isNaN(date.getTime())) return ''
  return `${date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })} · ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}

function resolveMediaUrl(url: string) {
  if (!url) return ''
  if (url.startsWith('data:')) return url
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  const normalized = url.startsWith('/') ? url : `/${url}`
  return `${API_URL}${normalized}`
}

function excerpt(message: string, maxLength = 160) {
  const text = String(message || '').replace(/\s+/g, ' ').trim()
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength).trimEnd()}…`
}

export default function AnnouncementsPage({ onBack }: AnnouncementsPageProps) {
  const [theme, setTheme] = useState<ThemePreference>(() => getStoredTheme(null))
  const [announcements, setAnnouncements] = useState<PublicAnnouncement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    setActiveThemeScope(null)
    const initialTheme = getStoredTheme(null)
    setTheme(initialTheme)
    applyThemePreference(initialTheme, { persist: false, scope: null })
  }, [])

  const fetchAnnouncements = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch(`${API_URL}/api/announcements`)
      if (!response.ok) {
        throw new Error(`Failed to load announcements (${response.status})`)
      }
      const data = await response.json()
      setAnnouncements(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('Failed to load public announcements:', err)
      setError(err instanceof Error ? err.message : 'Failed to load announcements.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchAnnouncements()
  }, [])

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return announcements.filter((announcement) => {
      const matchesType = typeFilter === 'all' || announcement.type === typeFilter
      const matchesSearch =
        term.length === 0 ||
        announcement.title.toLowerCase().includes(term) ||
        announcement.message.toLowerCase().includes(term)
      return matchesType && matchesSearch
    })
  }, [announcements, typeFilter, searchTerm])

  const selected = useMemo(
    () => announcements.find((announcement) => announcement._id === selectedId) || null,
    [announcements, selectedId]
  )

  const handleThemeChange = (nextTheme: ThemePreference) => {
    setTheme(nextTheme)
    applyThemePreference(nextTheme, { animate: true, scope: null })
  }

  const toggleDarkLightTheme = () => {
    handleThemeChange(theme === 'dark' ? 'light' : 'dark')
  }

  const displayedTheme = theme === 'auto' ? 'Auto' : theme === 'dark' ? 'Dark' : 'Light'

  return (
    <div className="announce-page">
      <nav className="announce-nav">
        <div className="container announce-container">
          <button type="button" className="announce-brand" onClick={onBack}>
            <img src="/logo-bg-removed.png" alt="West Coast College seal" />
            <span>West Coast College</span>
          </button>

          <div className="announce-nav-right">
            <div className="announce-theme-picker">
              <span>Theme</span>
              <select
                value={theme}
                onChange={(event) => handleThemeChange(event.target.value as ThemePreference)}
                aria-label="Theme mode selector"
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="auto">Auto</option>
              </select>
            </div>
            <button
              type="button"
              className="announce-theme-icon-btn"
              onClick={toggleDarkLightTheme}
              aria-label={`Current theme: ${displayedTheme}`}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                {theme === 'dark' ? 'light_mode' : 'dark_mode'}
              </span>
            </button>
            <button type="button" className="announce-portal-btn" onClick={onBack}>
              Back to Home
            </button>
          </div>
        </div>
      </nav>

      <main>
        <section className="announce-hero" aria-label="Announcements">
          <div className="announce-hero-glow" aria-hidden="true" />
          <div className="container announce-container announce-hero-content">
            <span className="announce-kicker">News &amp; Updates</span>
            <h1>Announcements</h1>
            <p>Official advisories, campus updates, and upcoming activities from West Coast College.</p>
          </div>
        </section>

        {selected ? (
          <section className="announce-detail-section" aria-label="Announcement detail">
            <div className="container announce-container">
              <button type="button" className="announce-back-btn" onClick={() => setSelectedId(null)}>
                <span className="material-symbols-outlined" aria-hidden="true">arrow_back</span>
                All announcements
              </button>

              <article className="announce-detail-card">
                <div className="announce-badges">
                  <span className={`announce-type-badge announce-type-${selected.type}`}>
                    <span className="material-symbols-outlined" aria-hidden="true">
                      {TYPE_META[selected.type]?.icon || 'info'}
                    </span>
                    {TYPE_META[selected.type]?.label || selected.type}
                  </span>
                  {selected.isPinned && (
                    <span className="announce-pinned-badge">
                      <span className="material-symbols-outlined" aria-hidden="true">keep</span>
                      Pinned
                    </span>
                  )}
                </div>

                <h2 className="announce-detail-title">{selected.title}</h2>
                <div className="announce-meta">
                  <span>
                    <span className="material-symbols-outlined" aria-hidden="true">calendar_month</span>
                    {formatDate(selected.createdAt)}
                  </span>
                  {selected.createdBy && (
                    <span>
                      <span className="material-symbols-outlined" aria-hidden="true">person</span>
                      {selected.createdBy.displayName || selected.createdBy.username || 'WCC Admin'}
                    </span>
                  )}
                  {selected.expiresAt && (
                    <span>
                      <span className="material-symbols-outlined" aria-hidden="true">schedule</span>
                      Expires {formatDate(selected.expiresAt)}
                    </span>
                  )}
                </div>

                {selected.media && selected.media.length > 0 && (
                  <div className="announce-media-grid">
                    {selected.media.map((media, index) => (
                      <figure key={index} className="announce-media-item">
                        {media.type === 'image' ? (
                          <img
                            src={resolveMediaUrl(media.url)}
                            alt={media.caption || selected.title}
                            loading="lazy"
                          />
                        ) : (
                          <video src={resolveMediaUrl(media.url)} controls preload="metadata" />
                        )}
                        {media.caption && <figcaption>{media.caption}</figcaption>}
                      </figure>
                    ))}
                  </div>
                )}

                <div className="announce-detail-message">
                  {String(selected.message || '').split('\n').map((paragraph, index) => (
                    <p key={index}>{paragraph}</p>
                  ))}
                </div>

                <div className="announce-audience">
                  <span className="material-symbols-outlined" aria-hidden="true">groups</span>
                  {getAnnouncementAudienceLabels(selected.targetAudience).map((label) => (
                    <span key={label} className="announce-audience-pill">{label}</span>
                  ))}
                </div>
              </article>
            </div>
          </section>
        ) : (
          <section className="announce-list-section" aria-label="Announcement list">
            <div className="container announce-container">
              <div className="announce-controls">
                <div className="announce-search">
                  <span className="material-symbols-outlined" aria-hidden="true">search</span>
                  <input
                    type="text"
                    placeholder="Search announcements..."
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    aria-label="Search announcements"
                  />
                </div>
                <div className="announce-type-filters" role="group" aria-label="Filter by type">
                  {TYPE_FILTERS.map((type) => (
                    <button
                      key={type}
                      type="button"
                      className={`announce-filter-btn ${typeFilter === type ? 'active' : ''}`}
                      onClick={() => setTypeFilter(type)}
                      aria-pressed={typeFilter === type}
                    >
                      {type === 'all' ? 'All' : TYPE_META[type].label}
                    </button>
                  ))}
                </div>
              </div>

              {loading ? (
                <div className="announce-loading" role="status">
                  <div className="announce-spinner" aria-hidden="true" />
                  <p>Loading announcements...</p>
                </div>
              ) : error ? (
                <div className="announce-error" role="alert">
                  <span className="material-symbols-outlined" aria-hidden="true">error</span>
                  <h3>Could not load announcements</h3>
                  <p>{error}</p>
                  <button type="button" onClick={() => void fetchAnnouncements()}>
                    Try again
                  </button>
                </div>
              ) : filtered.length === 0 ? (
                <div className="announce-empty">
                  <span className="material-symbols-outlined" aria-hidden="true">campaign</span>
                  <h3>No announcements found</h3>
                  <p>
                    {announcements.length === 0
                      ? 'There are no announcements right now. Please check back later.'
                      : 'Try adjusting your search or type filter.'}
                  </p>
                </div>
              ) : (
                <div className="announce-grid">
                  {filtered.map((announcement) => (
                    <article key={announcement._id} className="announce-card">
                      <div className="announce-badges">
                        <span className={`announce-type-badge announce-type-${announcement.type}`}>
                          <span className="material-symbols-outlined" aria-hidden="true">
                            {TYPE_META[announcement.type]?.icon || 'info'}
                          </span>
                          {TYPE_META[announcement.type]?.label || announcement.type}
                        </span>
                        {announcement.isPinned && (
                          <span className="announce-pinned-badge">
                            <span className="material-symbols-outlined" aria-hidden="true">keep</span>
                            Pinned
                          </span>
                        )}
                      </div>
                      <h3>{announcement.title}</h3>
                      <p className="announce-excerpt">{excerpt(announcement.message)}</p>
                      <div className="announce-card-foot">
                        <span className="announce-date">
                          <span className="material-symbols-outlined" aria-hidden="true">calendar_month</span>
                          {formatDate(announcement.createdAt)}
                        </span>
                        <button type="button" onClick={() => {
                          setSelectedId(announcement._id)
                          window.scrollTo({ top: 0, behavior: 'smooth' })
                        }}>
                          Read more
                          <span className="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      <footer className="announce-footer">
        <div className="container announce-container">
          <span>West Coast College · Official Announcements</span>
          <button type="button" onClick={onBack}>Back to Home</button>
        </div>
      </footer>
    </div>
  )
}

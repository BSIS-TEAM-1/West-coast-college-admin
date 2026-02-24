import { useEffect, useState } from 'react'
import './CookieSystemPage.css'

type CookieSystemPageProps = {
  onBack: () => void
}

type OptionalPreferenceKey = 'analytics' | 'marketing' | 'functional'

type CookiePreferences = {
  essential: true
  analytics: boolean
  marketing: boolean
  functional: boolean
  consentGiven: boolean
  lastUpdated: string
}

type CookieCategory = {
  title: string
  description: string
  examples: string[]
  statusText: string
  preferenceKey?: OptionalPreferenceKey
}

const COOKIE_PREFERENCES_STORAGE_KEY = 'wcc_cookie_preferences'

const formatAsUsDate = (date: Date): string => {
  const month = date.getMonth() + 1
  const day = date.getDate()
  const year = date.getFullYear()
  return `${month}/${day}/${year}`
}

const DEFAULT_COOKIE_PREFERENCES: CookiePreferences = {
  essential: true,
  analytics: false,
  marketing: false,
  functional: false,
  consentGiven: true,
  lastUpdated: formatAsUsDate(new Date())
}

const COOKIE_CATEGORIES: CookieCategory[] = [
  {
    title: 'Essential Cookies',
    statusText: 'Always Active',
    description:
      'These cookies are strictly necessary to provide services available through the portal and to use secure features.',
    examples: [
      'Authentication and security tokens',
      'Session management',
      'CSRF protection',
      'Load balancing'
    ]
  },
  {
    title: 'Analytics Cookies',
    statusText: 'Optional',
    preferenceKey: 'analytics',
    description:
      'These cookies help us measure traffic and understand user behavior so we can improve website performance.',
    examples: [
      'Google Analytics (_ga, _gid, _gat)',
      'Page view tracking',
      'User behavior analysis',
      'Performance monitoring'
    ]
  },
  {
    title: 'Marketing Cookies',
    statusText: 'Optional',
    preferenceKey: 'marketing',
    description:
      'These cookies may be set by advertising and social partners to deliver relevant campaigns across websites.',
    examples: [
      'Facebook Pixel',
      'Google Ads conversion tracking',
      'Retargeting cookies',
      'Social media integration'
    ]
  },
  {
    title: 'Functional Cookies',
    statusText: 'Optional',
    preferenceKey: 'functional',
    description:
      'These cookies enable enhanced functionality and personalization for better usability and experience.',
    examples: ['Language preferences', 'Live chat widgets', 'Video embeds', 'Interactive maps']
  }
]

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const parseStoredPreferences = (value: string): CookiePreferences | null => {
  try {
    const parsed: unknown = JSON.parse(value)
    if (!isObjectRecord(parsed)) return null

    const analytics = typeof parsed.analytics === 'boolean' ? parsed.analytics : false
    const marketing = typeof parsed.marketing === 'boolean' ? parsed.marketing : false
    const functional = typeof parsed.functional === 'boolean' ? parsed.functional : false
    const consentGiven = typeof parsed.consentGiven === 'boolean' ? parsed.consentGiven : true
    const lastUpdated =
      typeof parsed.lastUpdated === 'string' && parsed.lastUpdated.trim().length > 0
        ? parsed.lastUpdated
        : DEFAULT_COOKIE_PREFERENCES.lastUpdated

    return {
      essential: true,
      analytics,
      marketing,
      functional,
      consentGiven,
      lastUpdated
    }
  } catch {
    return null
  }
}

export default function CookieSystemPage({ onBack }: CookieSystemPageProps) {
  const [preferences, setPreferences] = useState<CookiePreferences>(DEFAULT_COOKIE_PREFERENCES)
  const [statusMessage, setStatusMessage] = useState('')

  useEffect(() => {
    const stored = window.localStorage.getItem(COOKIE_PREFERENCES_STORAGE_KEY)
    if (!stored) return

    const parsedPreferences = parseStoredPreferences(stored)
    if (parsedPreferences) {
      setPreferences(parsedPreferences)
    }
  }, [])

  const persistPreferences = (next: CookiePreferences, message: string) => {
    setPreferences(next)
    setStatusMessage(message)
    window.localStorage.setItem(COOKIE_PREFERENCES_STORAGE_KEY, JSON.stringify(next))
  }

  const togglePreference = (key: OptionalPreferenceKey) => {
    setStatusMessage('')
    setPreferences(previous => ({
      ...previous,
      [key]: !previous[key]
    }))
  }

  const handleSave = () => {
    const now = formatAsUsDate(new Date())
    persistPreferences(
      {
        ...preferences,
        essential: true,
        consentGiven: true,
        lastUpdated: now
      },
      'Cookie preferences saved.'
    )
  }

  const handleAcceptAll = () => {
    const now = formatAsUsDate(new Date())
    persistPreferences(
      {
        essential: true,
        analytics: true,
        marketing: true,
        functional: true,
        consentGiven: true,
        lastUpdated: now
      },
      'All optional cookies are enabled.'
    )
  }

  const handleEssentialOnly = () => {
    const now = formatAsUsDate(new Date())
    persistPreferences(
      {
        essential: true,
        analytics: false,
        marketing: false,
        functional: false,
        consentGiven: true,
        lastUpdated: now
      },
      'Only essential cookies are active.'
    )
  }

  return (
    <div className="cookie-system-page">
      <header className="cookie-system-header">
        <a href="#top" className="cookie-system-brand">
          <img src="/Logo.jpg" alt="West Coast College" />
          <span>West Coast College</span>
        </a>
        <div className="cookie-system-header-actions">
          <button type="button" className="cookie-system-btn cookie-system-btn-ghost" onClick={onBack}>
            Back to Landing
          </button>
        </div>
      </header>

      <main className="cookie-system-main" id="top">
        <section className="cookie-system-hero">
          <p className="cookie-system-kicker">Cookie Settings</p>
          <h1>Cookie Preference Center</h1>
          <p>
            Manage your cookie preferences and learn how we use cookies to improve your experience.
            Your privacy matters, and you can control optional cookie categories at any time.
          </p>
        </section>

        <section className="cookie-system-status-card">
          <h2>Current Consent Status</h2>
          <div className="cookie-system-status-grid">
            <div>
              <p className="cookie-system-status-label">Consent Given</p>
              <p className="cookie-system-status-value">{preferences.consentGiven ? 'Yes' : 'No'}</p>
            </div>
            <div>
              <p className="cookie-system-status-label">Last Updated</p>
              <p className="cookie-system-status-value">{preferences.lastUpdated}</p>
            </div>
          </div>
          <div className="cookie-system-action-row">
            <button
              type="button"
              className="cookie-system-btn cookie-system-btn-primary"
              onClick={handleAcceptAll}
            >
              Accept All
            </button>
            <button
              type="button"
              className="cookie-system-btn cookie-system-btn-secondary"
              onClick={handleEssentialOnly}
            >
              Essential Only
            </button>
            <button
              type="button"
              className="cookie-system-btn cookie-system-btn-secondary"
              onClick={handleSave}
            >
              Save Preferences
            </button>
          </div>
          <p className="cookie-system-save-note" role="status" aria-live="polite">
            {statusMessage}
          </p>
        </section>

        <section className="cookie-system-grid" aria-label="Cookie categories">
          {COOKIE_CATEGORIES.map(category => {
            const isAlwaysActive = !category.preferenceKey
            const isEnabled = category.preferenceKey ? preferences[category.preferenceKey] : true

            return (
              <article className="cookie-system-card" key={category.title}>
                <div className="cookie-system-card-head">
                  <div>
                    <h3>{category.title}</h3>
                    <p className="cookie-system-card-status">{category.statusText}</p>
                  </div>
                  <div className="cookie-system-toggle-wrap">
                    <label className="cookie-system-toggle" aria-label={`Toggle ${category.title}`}>
                      <input
                        type="checkbox"
                        checked={isEnabled}
                        disabled={isAlwaysActive}
                        onChange={() => {
                          if (category.preferenceKey) {
                            togglePreference(category.preferenceKey)
                          }
                        }}
                      />
                      <span className="cookie-system-toggle-slider" />
                    </label>
                    <span className="cookie-system-toggle-state">
                      {isAlwaysActive ? 'Always On' : isEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                </div>

                <p className="cookie-system-card-desc">{category.description}</p>
                <p className="cookie-system-example-label">Examples:</p>
                <ul className="cookie-system-example-list">
                  {category.examples.map(example => (
                    <li key={example}>{example}</li>
                  ))}
                </ul>
              </article>
            )
          })}
        </section>
      </main>
    </div>
  )
}

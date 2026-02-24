import './CookiePolicyPage.css'

type CookiePolicyPageProps = {
  onBack: () => void
}

const cookieCategories = [
  {
    title: 'Essential Cookies',
    description:
      'Required for core platform security and access. These cannot be disabled because they are necessary for portal functionality.',
    examples: [
      'Authentication and security tokens',
      'Session management',
      'CSRF protection',
      'Load balancing'
    ]
  },
  {
    title: 'Analytics Cookies',
    description:
      'Used to understand traffic patterns and improve performance through statistical insights about usage behavior.',
    examples: [
      'Google Analytics (_ga, _gid, _gat)',
      'Page view tracking',
      'User behavior analysis',
      'Performance monitoring'
    ]
  },
  {
    title: 'Marketing Cookies',
    description:
      'May be used by service partners to support outreach and measure campaign relevance across channels.',
    examples: [
      'Facebook Pixel',
      'Google Ads conversion tracking',
      'Retargeting cookies',
      'Social media integration'
    ]
  },
  {
    title: 'Functional Cookies',
    description:
      'Enable enhanced features and personalization such as preferred language, media embedding, and user convenience options.',
    examples: ['Language preferences', 'Live chat widgets', 'Video embeds', 'Interactive maps']
  }
]

export default function CookiePolicyPage({ onBack }: CookiePolicyPageProps) {
  return (
    <div className="cookie-policy-page">
      <header className="cookie-policy-header">
        <a href="#top" className="cookie-policy-brand">
          <img src="/Logo.jpg" alt="West Coast College" />
          <span>West Coast College</span>
        </a>
        <div className="cookie-policy-header-actions">
          <button type="button" className="cookie-policy-btn cookie-policy-btn-ghost" onClick={onBack}>
            Back to Landing
          </button>
        </div>
      </header>

      <main className="cookie-policy-main" id="top">
        <section className="cookie-policy-hero">
          <p className="cookie-policy-kicker">Policy Notice</p>
          <h1>Cookie Policy</h1>
          <p className="cookie-policy-effective-date">Effective Date: February 24, 2026</p>
          <p>
            This Cookie Policy explains how West Coast College uses cookies and similar technologies
            on its digital platforms. It describes what cookies are, how they are used, and the
            choices available to users.
          </p>
        </section>

        <section className="cookie-policy-grid">
          <article className="cookie-policy-card">
            <h2>What Are Cookies</h2>
            <p>
              Cookies are small text files stored on your device when you visit a website. They help
              websites remember session details, user settings, and interaction preferences.
            </p>
          </article>

          <article className="cookie-policy-card">
            <h2>How We Use Cookies</h2>
            <p>
              We use cookies to provide secure system access, support platform performance, remember
              preferences, and improve service quality based on aggregate usage metrics.
            </p>
          </article>

          <article className="cookie-policy-card cookie-policy-card-wide">
            <h2>Cookie Categories</h2>
            <div className="cookie-policy-category-grid">
              {cookieCategories.map(category => (
                <div className="cookie-policy-category" key={category.title}>
                  <h3>{category.title}</h3>
                  <p>{category.description}</p>
                  <p className="cookie-policy-example-label">Examples:</p>
                  <ul>
                    {category.examples.map(example => (
                      <li key={example}>{example}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </article>

          <article className="cookie-policy-card">
            <h2>Third-Party Cookies</h2>
            <p>
              Some services may set cookies through integrated tools. These third parties process data
              according to their own privacy practices and terms.
            </p>
          </article>

          <article className="cookie-policy-card">
            <h2>Managing Your Preferences</h2>
            <p>
              You can update optional cookie preferences through the Cookie System page. Browser
              settings can also block or delete cookies, though this may affect some functionality.
            </p>
          </article>

          <article className="cookie-policy-card">
            <h2>Data Retention</h2>
            <p>
              Cookie retention periods vary by purpose and configuration. Essential cookies may remain
              active only for session security while other categories may persist longer based on
              settings and policy requirements.
            </p>
          </article>

          <article className="cookie-policy-card">
            <h2>Policy Updates</h2>
            <p>
              This policy may be updated to reflect legal, operational, or technical changes. Updated
              versions become effective when posted on this portal.
            </p>
          </article>

          <article className="cookie-policy-card">
            <h2>Contact</h2>
            <p>
              For questions about this Cookie Policy, contact West Coast College through official
              registrar communication channels, including:
            </p>
            <a href="mailto:westcoastcollegeregistrar@gmail.com" className="cookie-policy-contact-link">
              westcoastcollegeregistrar@gmail.com
            </a>
          </article>
        </section>
      </main>
    </div>
  )
}

import './AboutPage.css'

type AboutPageProps = {
  onBack: () => void
}

type ValueIcon = 'excellence' | 'integrity' | 'service' | 'innovation'

type HeroSignal = {
  value: string
  title: string
  description: string
}

type CoreValue = {
  eyebrow: string
  title: string
  description: string
  accent: 'gold' | 'blue'
  icon: ValueIcon
}

type PracticePillar = {
  title: string
  description: string
}

const heroTags = [
  'CHED-aligned learning',
  'Gold and blue identity',
  'Student-centered systems'
]

const institutionalMandate = [
  'Provide relevant and quality higher education programs aligned with CHED standards',
  'Support student learning through structured academic systems and services',
  'Promote research, skills development, and community engagement',
  'Uphold institutional values that foster discipline, integrity, and social responsibility'
]

const heroSignals: HeroSignal[] = [
  {
    value: 'CHED',
    title: 'Aligned Standards',
    description: 'Programs and services reflect national higher education expectations.'
  },
  {
    value: '04',
    title: 'Core Values',
    description: 'Excellence, integrity, service, and innovation shape the culture.'
  },
  {
    value: '03',
    title: 'Growth Drivers',
    description: 'Academic quality, student support, and community impact stay in focus.'
  }
]

const practicePillars: PracticePillar[] = [
  {
    title: 'Academic Systems',
    description: 'Clear instruction, assessment, and program delivery that support quality outcomes.'
  },
  {
    title: 'Student Experience',
    description: 'Admissions, enrollment, and records workflows designed to reduce friction for learners.'
  },
  {
    title: 'Community Relevance',
    description: 'Research, outreach, and leadership efforts that keep education responsive to society.'
  }
]

const coreValues: CoreValue[] = [
  {
    eyebrow: '01 / Standards',
    title: 'Excellence',
    description: 'Commitment to academic quality, discipline, and professional competence.',
    accent: 'gold',
    icon: 'excellence'
  },
  {
    eyebrow: '02 / Trust',
    title: 'Integrity',
    description: 'Upholding ethical conduct, accountability, and transparency in every action.',
    accent: 'blue',
    icon: 'integrity'
  },
  {
    eyebrow: '03 / Community',
    title: 'Service',
    description: 'Responding to learners and communities with empathy, care, and responsibility.',
    accent: 'gold',
    icon: 'service'
  },
  {
    eyebrow: '04 / Progress',
    title: 'Innovation',
    description: 'Improving learning and operations through modern tools and forward thinking.',
    accent: 'blue',
    icon: 'innovation'
  }
]

function AboutValueIcon({ icon }: { icon: ValueIcon }) {
  switch (icon) {
    case 'excellence':
      return (
        <svg viewBox="0 0 48 48" className="about-value-icon-svg" focusable="false" aria-hidden="true">
          <path d="M24 8l4.6 10.4L39 23l-10.4 4.6L24 40l-4.6-12.4L9 23l10.4-4.6Z" />
          <path d="M24 15.5l2.1 5.4 5.4 2.1-5.4 2.1L24 32.5l-2.1-7.4-5.4-2.1 5.4-2.1Z" />
        </svg>
      )
    case 'integrity':
      return (
        <svg viewBox="0 0 48 48" className="about-value-icon-svg" focusable="false" aria-hidden="true">
          <path d="M24 8l13 5.1v9.7c0 8.1-5.1 15.4-13 19.2-7.9-3.8-13-11.1-13-19.2v-9.7Z" />
          <path d="M18.5 24.4l4 4 7-8.1" />
        </svg>
      )
    case 'service':
      return (
        <svg viewBox="0 0 48 48" className="about-value-icon-svg" focusable="false" aria-hidden="true">
          <path d="M14.5 21.5C16.3 17.7 19.8 15 24 15s7.7 2.7 9.5 6.5" />
          <path d="M11 29c3.1-3.8 7.8-6 13-6s9.9 2.2 13 6" />
          <path d="M16.2 31.2c2 2.8 4.7 4.9 7.8 6.1 3.1-1.2 5.8-3.3 7.8-6.1" />
          <circle cx="24" cy="20" r="2.5" />
        </svg>
      )
    case 'innovation':
      return (
        <svg viewBox="0 0 48 48" className="about-value-icon-svg" focusable="false" aria-hidden="true">
          <circle cx="24" cy="24" r="6.5" />
          <path d="M24 9v7" />
          <path d="M24 32v7" />
          <path d="M9 24h7" />
          <path d="M32 24h7" />
          <path d="M14.5 14.5l4.9 4.9" />
          <path d="M28.6 28.6l4.9 4.9" />
          <path d="M33.5 14.5l-4.9 4.9" />
          <path d="M19.4 28.6l-4.9 4.9" />
        </svg>
      )
  }
}

export default function AboutPage({ onBack }: AboutPageProps) {
  return (
    <div className="about-page">
      <header className="about-header">
        <a href="#top" className="about-brand">
          <img src="/logo-bg-removed.png" alt="West Coast College" />
          <span>West Coast College</span>
        </a>
        <div className="about-header-actions">
          <button type="button" className="about-btn about-btn-ghost" onClick={onBack}>
            Back to Landing
          </button>
        </div>
      </header>

      <main className="about-main" id="top">
        <section className="about-hero" aria-label="About West Coast College">
          <div className="about-hero-copy">
            <p className="about-kicker">Institution Profile</p>
            <h1>About West Coast College</h1>
            <p className="about-hero-lead">
              A developing higher education institution in the Bicol Region with a student
              journey shaped by academic discipline, accessible support, and a distinctly
              gold-and-blue identity.
            </p>
            <p>
              West Coast College (WCC) is a private higher education institution focused on
              accessible, standards-based learning and responsive academic services for the
              communities it serves.
            </p>
            <p>
              From admissions to graduation, the institution continues to strengthen its
              academic and administrative systems so learners experience clearer processes,
              practical preparation, and meaningful guidance.
            </p>
            <div className="about-hero-tags" aria-label="Institution highlights">
              {heroTags.map(tag => (
                <span key={tag} className="about-hero-tag">
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <aside className="about-hero-panel" aria-label="Institution highlights panel">
            <div className="about-crest">
              <div className="about-crest-mark">
                <img src="/logo-bg-removed.png" alt="West Coast College seal" />
              </div>
              <div className="about-crest-copy">
                <p>Campus Promise</p>
                <h2>Quality education supported by modern systems and purposeful service.</h2>
              </div>
            </div>

            <div className="about-signal-grid">
              {heroSignals.map(signal => (
                <article key={signal.title} className="about-signal-card">
                  <strong>{signal.value}</strong>
                  <h3>{signal.title}</h3>
                  <p>{signal.description}</p>
                </article>
              ))}
            </div>

            <div className="about-hero-note">
              <span className="about-hero-note-line" aria-hidden="true" />
              <p>
                WCC combines structured instruction, student support, and community engagement
                to prepare learners for work, leadership, and lifelong growth.
              </p>
            </div>
          </aside>
        </section>

        <section className="about-foundation" aria-label="Institution foundation">
          <article className="about-section-card about-section-card-wide">
            <p className="about-card-label">Institutional Mandate</p>
            <h2>West Coast College Exists To</h2>
            <ul className="about-bullet-list">
              {institutionalMandate.map(item => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>

          <article className="about-section-card">
            <p className="about-card-label">Vision</p>
            <h2>Strategic Direction</h2>
            <p>
              By providing quality education, the College envisions itself as an educational
              institution that would develop highly disciplined and professionally competent,
              appreciative-of-Filipino-culture individuals who would contribute to building a
              just and humane Philippine society.
            </p>
          </article>

          <article className="about-section-card">
            <p className="about-card-label">Mission</p>
            <h2>Institutional Commitment</h2>
            <p>
              West Coast College believes that all persons, regardless of status in life, are
              imbued with dignity and that all resources, whether personal or communal, should
              be harnessed to promote this dignity.
            </p>
            <p>
              The College commits itself to pursue relevant and responsive programs utilizing
              modern educational technology that would develop competent and ethical
              professionals dedicated to the advancement of knowledge, appreciative of arts and
              culture, and who provide meaningful leadership to their community and the
              Philippine society as a whole.
            </p>
          </article>
        </section>

        <section className="about-values-section" aria-label="Core values section">
          <div className="about-section-heading">
            <p>Guiding Culture</p>
            <h2>Core values that make the institution feel distinct</h2>
            <span>
              These principles shape how West Coast College teaches, serves, and keeps improving.
            </span>
          </div>

          <div className="about-values-grid">
            {coreValues.map(value => (
              <article
                key={value.title}
                className="about-value-card"
                data-accent={value.accent}
              >
                <div className="about-value-icon" aria-hidden="true">
                  <AboutValueIcon icon={value.icon} />
                </div>
                <p className="about-value-eyebrow">{value.eyebrow}</p>
                <h3 className="about-value-title">{value.title}</h3>
                <p className="about-value-description">{value.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="about-commitment-grid" aria-label="Institutional commitment">
          <article className="about-section-card about-commitment-card">
            <p className="about-card-label">Continuous Improvement</p>
            <h2>Building a better student experience over time</h2>
            <p>
              In fulfilling its mandate, West Coast College continuously strengthens its
              academic programs, administrative systems, and student services to remain aligned
              with national higher education standards and responsive to community needs.
            </p>
            <p>
              The result is an institutional experience that aims to be disciplined in
              structure, warm in support, and practical in outcomes.
            </p>
          </article>

          <aside className="about-pillars-panel">
            <p className="about-pillars-kicker">Operational Focus</p>
            <h2>How WCC turns its mandate into everyday practice</h2>
            <div className="about-pillars-list">
              {practicePillars.map(pillar => (
                <article key={pillar.title} className="about-pillar-item">
                  <h3>{pillar.title}</h3>
                  <p>{pillar.description}</p>
                </article>
              ))}
            </div>
          </aside>
        </section>
      </main>
    </div>
  )
}

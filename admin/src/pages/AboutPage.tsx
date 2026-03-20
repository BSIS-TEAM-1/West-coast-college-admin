import './AboutPage.css'

type AboutPageProps = {
  onBack: () => void
}

const institutionalMandate = [
  'Provide relevant and quality higher education programs aligned with CHED standards',
  'Support student learning through structured academic systems and services',
  'Promote research, skills development, and community engagement',
  'Uphold institutional values that foster discipline, integrity, and social responsibility'
]

const institutionalHighlights = [
  'Program quality aligned with national educational policy frameworks',
  'Strong student support through guided academic and administrative services',
  'Commitment to research, innovation, and responsible community partnership'
]

export default function AboutPage({ onBack }: AboutPageProps) {
  return (
    <div className="about-page">
      <header className="about-header">
        <a href="#top" className="about-brand">
          <img src="/Logo.jpg" alt="West Coast College" />
          <span>West Coast College</span>
        </a>
        <div className="about-header-actions">
          <button type="button" className="about-btn about-btn-ghost" onClick={onBack}>
            Back to Landing
          </button>
        </div>
      </header>

      <main className="about-main" id="top">
        <section className="about-hero">
          <div className="about-hero-copy">
            <p className="about-kicker">Institution Profile</p>
            <h1>About West Coast College</h1>
            <p>
              West Coast College (WCC) is a private higher education institution in the Bicol
              Region. We are committed to providing accessible, standards-based tertiary education
              for learners in the community and beyond. Our academic and administrative systems are
              designed to strengthen student outcomes and support long-term professional growth.
            </p>
            <p>
              Operating in line with national educational guidelines and Commission on Higher Education
              (CHED) requirements, WCC focuses on relevance, quality assurance, and meaningful
              service to society. The institution combines structured instruction with practical
              support to prepare graduates for modern workplaces and civic leadership.
            </p>
            <div className="about-highlights" aria-label="Institution highlights">
              {institutionalHighlights.map(item => (
                <div key={item} className="about-highlight-item">
                  <span className="about-highlight-bullet" aria-hidden="true" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
          <aside className="about-hero-image-wrap" aria-label="West Coast College image">
            <img src="/logo-header.jpg" alt="West Coast College campus visual" />
          </aside>
        </section>

        <section className="about-grid" aria-label="Institution information">
          <article className="about-card about-card-wide">
            <p className="about-card-label">Institutional Mandate</p>
            <h2>West Coast College Exists To</h2>
            <ul className="about-bullet-list">
              {institutionalMandate.map(item => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>

          <article className="about-card">
            <p className="about-card-label">Vision</p>
            <h2>Institutional Direction</h2>
            <p>
              West Coast College envisions being a leading private higher education institution in the
              Bicol Region recognized for academic quality, professional preparation, and sustained
              impact on the communities it serves.
            </p>
          </article>

          <article className="about-card">
            <p className="about-card-label">Mission</p>
            <h2>Institutional Purpose</h2>
            <p>
              West Coast College is dedicated to providing accessible, relevant, and quality higher
              education that equips students with knowledge, competencies, and values necessary for
              productive work, lifelong learning, and responsible citizenship.
            </p>
          </article>

          <article className="about-card about-card-wide">
            <p className="about-card-label">Institutional Commitment</p>
            <h2>Continuous Improvement</h2>
            <p>
              In fulfilling its mandate, West Coast College continuously strengthens its academic
              programs, administrative systems, and student services to ensure compliance with
              national higher education standards and responsiveness to societal needs.
            </p>
          </article>

        </section>
      </main>
    </div>
  )
}


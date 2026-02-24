import './AboutPage.css'

type AboutPageProps = {
  onBack: () => void
  onOpenStaffLogin: () => void
}

const institutionalMandate = [
  'Provide relevant and quality higher education programs aligned with CHED standards',
  'Support student learning through structured academic systems and services',
  'Promote research, skills development, and community engagement',
  'Uphold institutional values that foster discipline, integrity, and social responsibility'
]

export default function AboutPage({ onBack, onOpenStaffLogin }: AboutPageProps) {
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
          <button type="button" className="about-btn about-btn-primary" onClick={onOpenStaffLogin}>
            Staff Login
          </button>
        </div>
      </header>

      <main className="about-main" id="top">
        <section className="about-hero">
          <div className="about-hero-copy">
            <p className="about-kicker">Institution Profile</p>
            <h1>About West Coast College</h1>
            <p>
              West Coast College (WCC) is a private higher education institution in the Bicol Region
              committed to providing accessible and quality tertiary education to students within its
              service area and neighboring communities. The institution operates in accordance with
              national educational policies and standards set by the Commission on Higher Education
              (CHED), with the goal of supporting the development of competent, responsible, and
              productive citizens.
            </p>
            <p>
              West Coast College offers academic programs designed to address local and national
              development needs while promoting academic excellence, professional competence, and
              ethical values. Through its instructional services, student support programs, and
              institutional initiatives, the College seeks to contribute to human resource
              development and community advancement in the region.
            </p>
          </div>
          <div className="about-hero-image-wrap" aria-label="West Coast College image">
            <img src="/logo-header.jpg" alt="West Coast College campus visual" />
          </div>
        </section>

        <section className="about-grid">
          <article className="about-card about-card-wide">
            <p className="about-card-label">Institutional Mandate</p>
            <h2>West Coast College Exists To:</h2>
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
              West Coast College envisions itself as a recognized private higher education institution
              in the Bicol Region committed to academic quality, professional preparation, and
              community development.
            </p>
          </article>

          <article className="about-card">
            <p className="about-card-label">Mission</p>
            <h2>Institutional Purpose</h2>
            <p>
              West Coast College is dedicated to providing accessible, relevant, and quality higher
              education that equips learners with knowledge, competencies, and values necessary for
              productive employment, lifelong learning, and responsible citizenship.
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

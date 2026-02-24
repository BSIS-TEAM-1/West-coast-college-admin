import './TermsPolicyPage.css'

type TermsPolicyPageProps = {
  onBack: () => void
  onOpenStaffLogin: () => void
}

const definitions = [
  '"College" refers to West Coast College.',
  '"Portal" refers to the website, systems, and online services managed by the College.',
  '"User" refers to students, applicants, faculty, staff, parents, or authorized visitors accessing the portal.',
  '"Account" refers to credentials issued or approved by the College for access to protected services.'
]

const accountResponsibilities = [
  'Provide accurate and current information when creating or updating your account.',
  'Keep your username, password, and verification credentials confidential.',
  'Immediately report unauthorized access, suspected breaches, or incorrect account activity.',
  'Log out from shared or public devices after using the system.'
]

const properUsage = [
  'Use the portal only for legitimate academic, administrative, and communication purposes.',
  'Follow published school processes for enrollment, records requests, announcements, and related transactions.',
  'Respect institutional policies, other users, and applicable Philippine laws when using system features.'
]

const prohibitedUses = [
  'Attempting to bypass access controls, security checks, or account restrictions.',
  'Uploading malware, malicious scripts, spam, or unauthorized promotional content.',
  'Impersonating another user, sharing credentials, or submitting falsified records.',
  'Using automated scraping, bulk extraction, or disruptive activity that affects system performance.'
]

const availableServices = [
  'Admissions and enrollment support workflows',
  'Registrar requests and academic record processing',
  'School announcements and institutional updates',
  'Authorized staff and faculty service tools'
]

export default function TermsPolicyPage({ onBack, onOpenStaffLogin }: TermsPolicyPageProps) {
  return (
    <div className="terms-page">
      <header className="terms-header">
        <a href="#top" className="terms-brand">
          <img src="/Logo.jpg" alt="West Coast College" />
          <span>West Coast College</span>
        </a>
        <div className="terms-header-actions">
          <button type="button" className="terms-btn terms-btn-ghost" onClick={onBack}>
            Back to Landing
          </button>
          <button type="button" className="terms-btn terms-btn-primary" onClick={onOpenStaffLogin}>
            Staff Login
          </button>
        </div>
      </header>

      <main className="terms-main" id="top">
        <section className="terms-hero">
          <p className="terms-kicker">Legal and Policy Notice</p>
          <h1>Terms and Policy</h1>
          <p className="terms-effective-date">Effective Date: February 24, 2026</p>
          <p>
            These Terms and Policy govern access to and use of West Coast College digital platforms
            and services. By accessing or using this portal, you acknowledge that you have read,
            understood, and agreed to be bound by these terms.
          </p>
        </section>

        <section className="terms-grid">
          <article className="terms-card">
            <h2>Agreement to Terms</h2>
            <p>
              Your continued use of the portal constitutes acceptance of these terms, institutional
              regulations, and related privacy and cookie notices. If you do not agree, you must
              discontinue use of the portal.
            </p>
          </article>

          <article className="terms-card">
            <h2>Definitions</h2>
            <ul>
              {definitions.map(item => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>

          <article className="terms-card">
            <h2>Eligibility and System Access</h2>
            <p>
              Access is granted only to authorized users and applicants who meet institutional and
              legal requirements. The College may approve, limit, suspend, or revoke access when
              necessary to protect users, records, and system integrity.
            </p>
          </article>

          <article className="terms-card">
            <h2>Important Notice for Applicants</h2>
            <p>
              Submission through the portal does not automatically guarantee admission, enrollment,
              scholarship, or other approvals. Final decisions remain subject to document validation,
              academic policies, and official College review processes.
            </p>
          </article>

          <article className="terms-card">
            <h2>Account Responsibilities</h2>
            <ul>
              {accountResponsibilities.map(item => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>

          <article className="terms-card">
            <h2>Proper Usage</h2>
            <ul>
              {properUsage.map(item => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>

          <article className="terms-card">
            <h2>Prohibited Uses</h2>
            <ul>
              {prohibitedUses.map(item => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>

          <article className="terms-card">
            <h2>Available Services</h2>
            <ul>
              {availableServices.map(item => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>

          <article className="terms-card">
            <h2>Intellectual Property Rights</h2>
            <p>
              Portal content, official marks, designs, text, and system materials are owned by or
              licensed to West Coast College unless otherwise stated. Unauthorized reproduction,
              modification, distribution, or commercial use is prohibited without written permission.
            </p>
          </article>

          <article className="terms-card">
            <h2>System Availability</h2>
            <p>
              The College aims to keep services available but does not guarantee uninterrupted access.
              Maintenance, updates, internet issues, and security events may cause temporary service
              interruptions, limited functionality, or scheduled downtime.
            </p>
          </article>

          <article className="terms-card">
            <h2>Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by law, West Coast College is not liable for indirect,
              incidental, or consequential damages arising from portal use, system interruption,
              third-party actions, or user-side technical issues.
            </p>
          </article>

          <article className="terms-card">
            <h2>Additional Provisions</h2>
            <p>
              The College may update these terms to reflect legal, policy, or operational changes.
              Updated versions take effect once published on this portal. For concerns, contact the
              Registrar through official College communication channels.
            </p>
          </article>
        </section>
      </main>
    </div>
  )
}

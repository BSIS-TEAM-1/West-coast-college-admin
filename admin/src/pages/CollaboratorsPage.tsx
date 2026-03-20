import './CollaboratorsPage.css'

type CollaboratorsPageProps = {
  onBack: () => void
}

type CollaboratorTreeNode = {
  name: string
  role: string
  image?: string
  contribution?: string
  children?: CollaboratorTreeNode[]
}

const foundingDigitalMembers = [
  {
    name: 'West Coast College ICT Office',
    role: 'Platform Coordination and Technical Oversight',
    image: '/Logo.jpg',
    contribution:
      'Defined system objectives, supervised implementation priorities, and ensured alignment with academic and institutional operations.'
  },
  {
    name: 'Founding Student Development Group',
    role: 'User Experience and Content Structuring',
    image: '/Logo.jpg',
    contribution:
      'Contributed UX direction, accessibility review, and content flow for the applicant and staff-facing workflows.'
  },
  {
    name: 'Systems Engineering Contributors',
    role: 'Core Application Development',
    image: '/Logo.jpg',
    contribution:
      'Built core interfaces, authentication workflows, and student-facing operational pages used by applicants and staff.'
  },
  {
    name: 'Digital Publication Team',
    role: 'Branding and Public Information Layout',
    image: '/Logo.jpg',
    contribution:
      'Created the interface system, page hierarchy, and institutional information presentation for the website.'
  }
]

const collaboratorsTree: CollaboratorTreeNode = {
  name: 'Lorenze Niño F. Prepotente',
  role: 'ICT Project Team Leader ',
  image: '/Logo.jpg',
  children: [
    {
      name: 'Shaine S. SanJuan',
      role: 'Project Collaborator and Analyst',
      image: '/Logo.jpg',
      children: [
        {
          name: 'Mhellary O. Valeza',
          role: 'Project Collaborator and Tester',
          image: '/Logo.jpg'
        }
      ]
    },
    {
      name: 'Experience Layer',
      role: 'User Guidance and Accessibility',
      image: '/Logo.jpg',
      children: [
        {
          name: 'Founding Student Development Group',
          role: 'UX Design and Content Structuring',
          image: '/Logo.jpg'
        },
        {
          name: 'Digital Publication Team',
          role: 'Information Architecture and Branding Layout',
          image: '/Logo.jpg'
        }
      ]
    },
    {
      name: 'Technical Layer',
      role: 'Core Application and Security Build',
      image: '/Logo.jpg',
      children: [
        {
          name: 'Systems Engineering Contributors',
          role: 'Authentication, Interfaces, and Operations',
          image: '/Logo.jpg'
        }
      ]
    }
  ]
}

function CollaboratorTreeNode({
  node,
  isRoot = false,
  depth = 0
}: {
  node: CollaboratorTreeNode
  isRoot?: boolean
  depth?: number
}) {
  const hasChildren = Boolean(node.children && node.children.length > 0)

  return (
    <li
      className={`collaborators-tree-node collaborators-tree-node--depth-${depth} ${isRoot ? 'collaborators-tree-node--root' : ''} ${hasChildren ? 'collaborators-tree-node--has-children' : ''}`}
    >
      <div className="collaborators-tree-card">
        <img
          className="collaborators-tree-card-image"
          src={node.image ?? '/Logo.jpg'}
          alt={node.name}
        />
        <p className="collaborators-tree-label">{node.role}</p>
        <p className="collaborators-tree-name">{node.name}</p>
        {node.contribution && <p className="collaborators-tree-contribution">{node.contribution}</p>}
      </div>

      {hasChildren && (
        <div className="collaborators-tree-branch">
          <div className="collaborators-tree-branch-line" aria-hidden="true" />
          <ul className="collaborators-tree-list collaborators-tree-list--children">
            {node.children!.map(child => (
              <CollaboratorTreeNode key={child.name} node={child} depth={depth + 1} />
            ))}
          </ul>
        </div>
      )}
    </li>
  )
}

export default function CollaboratorsPage({ onBack }: CollaboratorsPageProps) {
  return (
    <div className="collaborators-page">
      <header className="collaborators-header">
        <a href="#top" className="collaborators-brand">
          <img src="/Logo.jpg" alt="West Coast College" />
          <span>West Coast College</span>
        </a>
        <div className="collaborators-header-actions">
          <button type="button" className="collaborators-btn collaborators-btn-ghost" onClick={onBack}>
            Back to Landing
          </button>
        </div>
      </header>

      <main className="collaborators-main" id="top">
        <section className="collaborators-hero">
          <p className="collaborators-kicker">Founding Digital Team</p>
          <h1>About the Website Foundation</h1>
          <p>
            The West Coast College portal was created by a dedicated digital team to support secure
            enrollment and academic service operations. This page records the founding digital members
            and their contributions to the initial platform build.
          </p>
        </section>

        <section className="collaborators-grid" aria-label="Founding digital collaborators">
          {foundingDigitalMembers.map(member => (
            <article key={member.name} className="collaborators-card">
              <p className="collaborators-card-label">Founding Collaborator</p>
              <img
                className="collaborators-card-image"
                src={member.image ?? '/Logo.jpg'}
                alt={member.name}
              />
              <h2>{member.name}</h2>
              <p className="collaborators-role">{member.role}</p>
              <p>{member.contribution}</p>
            </article>
          ))}
        </section>

        <section className="collaborators-tree-section" aria-label="Collaborator hierarchy">
          <h2 className="collaborators-tree-title">Collaborator Tree</h2>
          <p className="collaborators-tree-intro">
            Hierarchical view of the founding contributors behind the portal build.
          </p>
          <ul className="collaborators-tree-list collaborators-tree-list--root">
            <CollaboratorTreeNode node={collaboratorsTree} isRoot />
          </ul>
        </section>
      </main>
    </div>
  )
}

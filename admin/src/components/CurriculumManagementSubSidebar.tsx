import { LayoutGrid, List, Plus, Archive } from 'lucide-react'
import './CurriculumManagementSubSidebar.css'

type CurriculumManagementView = 'overview' | 'curriculums' | 'create' | 'archived'

type CurriculumManagementSubSidebarProps = {
  activeView: CurriculumManagementView
  onNavigate: (view: CurriculumManagementView) => void
}

const NAV_ITEMS: { id: CurriculumManagementView; label: string; icon: any }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid },
  { id: 'curriculums', label: 'Curriculums', icon: List },
  { id: 'create', label: 'Create Curriculum', icon: Plus },
  { id: 'archived', label: 'Archived', icon: Archive },
]

export default function CurriculumManagementSubSidebar({ activeView, onNavigate }: CurriculumManagementSubSidebarProps) {
  return (
    <aside className="curriculum-sub-sidebar" aria-label="Curriculum Management navigation">
      <div className="curriculum-sub-sidebar-head">
        <h3>Curriculum Management</h3>
      </div>
      <nav className="curriculum-sub-sidebar-nav">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className={`curriculum-sub-sidebar-link ${activeView === id ? 'active' : ''}`}
            onClick={() => onNavigate(id)}
            aria-current={activeView === id ? 'page' : undefined}
          >
            <Icon size={18} className="curriculum-sub-sidebar-icon" />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </aside>
  )
}

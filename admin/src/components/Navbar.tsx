import { Menu } from 'lucide-react'
import './Navbar.css'

type NavbarProps = {
  username: string
  onLogout: () => void
  onMenuToggle?: () => void
}

export default function Navbar({ username, onMenuToggle }: NavbarProps) {
  const dateLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })

  return (
    <header className="navbar">
      {onMenuToggle && (
        <button
          type="button"
          className="navbar-menu-btn"
          onClick={onMenuToggle}
          aria-label="Toggle navigation menu"
        >
          <Menu size={20} />
        </button>
      )}
      <div className="navbar-center">
        <div className="navbar-center-top">Welcome back, {username}</div>
      </div>
      <div className="navbar-spacer" />
      <div className="navbar-user">
        <span className="navbar-date">{dateLabel}</span>
      </div>
    </header>
  )
}

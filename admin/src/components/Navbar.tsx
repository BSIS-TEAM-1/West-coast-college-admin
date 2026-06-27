import { Menu, User } from 'lucide-react'
import './Navbar.css'

type NavbarProps = {
  username: string
  onLogout: () => void
  onMenuToggle?: () => void
  isMenuOpen?: boolean
  menuId?: string
  profileName?: string
  profileRole?: string
  profileAvatar?: string | null
}

export default function Navbar({
  username,
  onMenuToggle,
  isMenuOpen = false,
  menuId,
  profileName,
  profileRole,
  profileAvatar
}: NavbarProps) {
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
          aria-expanded={isMenuOpen}
          aria-controls={menuId}
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
        {profileName && (
          <div className="navbar-profile">
            <div className="navbar-profile-avatar">
              {profileAvatar ? (
                <img
                  src={profileAvatar}
                  alt={`${profileName} profile`}
                  className="navbar-profile-avatar-img"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement
                    target.style.display = 'none'
                    target.nextElementSibling?.classList.remove('hidden')
                  }}
                />
              ) : null}
              <div className={`navbar-profile-avatar-placeholder ${profileAvatar ? 'hidden' : ''}`}>
                <User size={16} />
              </div>
            </div>
            <div className="navbar-profile-text">
              <span className="navbar-profile-name">{profileName}</span>
              {profileRole && <span className="navbar-profile-role">{profileRole}</span>}
            </div>
          </div>
        )}
      </div>
    </header>
  )
}

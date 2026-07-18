import { useEffect, useRef, useState } from 'react'
import { ChevronDown, LogOut, Menu, Monitor, Moon, Settings, Sun, User, UserCircle } from 'lucide-react'
import { applyThemePreference, getStoredTheme, resolveTheme, type ThemePreference } from '../lib/theme'
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
  onProfileClick?: () => void
  onSettingsClick?: () => void
}

export default function Navbar({
  username,
  onLogout,
  onMenuToggle,
  isMenuOpen = false,
  menuId,
  profileName,
  profileRole,
  profileAvatar,
  onProfileClick,
  onSettingsClick
}: NavbarProps) {
  const [theme, setTheme] = useState<ThemePreference>(() => getStoredTheme())
  const [resolvedTheme, setResolvedTheme] = useState(() => resolveTheme(getStoredTheme()))
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false)
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false)
  const themeMenuRef = useRef<HTMLDivElement>(null)
  const accountMenuRef = useRef<HTMLDivElement>(null)
  const dateLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
  const displayProfileName = profileName || username

  useEffect(() => {
    setResolvedTheme(applyThemePreference(theme, { persist: false }))

    if (theme !== 'auto') return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleSystemThemeChange = () => {
      setResolvedTheme(applyThemePreference('auto', { persist: false }))
    }

    mediaQuery.addEventListener('change', handleSystemThemeChange)
    return () => mediaQuery.removeEventListener('change', handleSystemThemeChange)
  }, [theme])

  useEffect(() => {
    if (!isAccountMenuOpen && !isThemeMenuOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      if (isThemeMenuOpen && !themeMenuRef.current?.contains(event.target as Node)) {
        setIsThemeMenuOpen(false)
      }
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        setIsAccountMenuOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsThemeMenuOpen(false)
        setIsAccountMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isAccountMenuOpen, isThemeMenuOpen])

  const handleThemeChange = (nextTheme: ThemePreference) => {
    setTheme(nextTheme)
    setResolvedTheme(applyThemePreference(nextTheme, { animate: true }))
    setIsThemeMenuOpen(false)
  }
  const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor
  const themeLabel = theme === 'auto' ? `Device (${resolvedTheme})` : theme === 'dark' ? 'Dark' : 'Light'

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
        <div className="navbar-theme" ref={themeMenuRef}>
          <button
            type="button"
            className="navbar-theme-trigger"
            onClick={() => setIsThemeMenuOpen((current) => !current)}
            aria-haspopup="menu"
            aria-expanded={isThemeMenuOpen}
            title="Theme"
          >
            <ThemeIcon size={18} />
            <span className="navbar-theme-trigger-label">{themeLabel}</span>
            <ChevronDown size={16} />
          </button>
          {isThemeMenuOpen ? (
            <div className="navbar-theme-menu" role="menu">
              <button type="button" role="menuitem" className={theme === 'light' ? 'active' : ''} onClick={() => handleThemeChange('light')}>
                <Sun size={18} />
                Light mode
              </button>
              <button type="button" role="menuitem" className={theme === 'dark' ? 'active' : ''} onClick={() => handleThemeChange('dark')}>
                <Moon size={18} />
                Dark mode
              </button>
              <button type="button" role="menuitem" className={theme === 'auto' ? 'active' : ''} onClick={() => handleThemeChange('auto')}>
                <Monitor size={18} />
                Device theme
              </button>
            </div>
          ) : null}
        </div>
        {displayProfileName && (
          <div className="navbar-account" ref={accountMenuRef}>
            <button
              type="button"
              className="navbar-profile"
              onClick={() => setIsAccountMenuOpen((current) => !current)}
              aria-haspopup="menu"
              aria-expanded={isAccountMenuOpen}
            >
              <div className="navbar-profile-avatar">
                {profileAvatar ? (
                  <img
                    src={profileAvatar}
                    alt={`${displayProfileName} profile`}
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
                <span className="navbar-profile-name">{displayProfileName}</span>
                {profileRole && <span className="navbar-profile-role">{profileRole}</span>}
              </div>
              <ChevronDown size={16} className="navbar-profile-chevron" />
            </button>
            {isAccountMenuOpen ? (
              <div className="navbar-account-menu" role="menu">
                <button type="button" role="menuitem" onClick={() => { onProfileClick?.(); setIsAccountMenuOpen(false) }}>
                  <UserCircle size={18} />
                  Profile
                </button>
                <button type="button" role="menuitem" onClick={() => { onSettingsClick?.(); setIsAccountMenuOpen(false) }}>
                  <Settings size={18} />
                  Settings
                </button>
                <button type="button" role="menuitem" className="navbar-account-menu-danger" onClick={() => { setIsAccountMenuOpen(false); onLogout() }}>
                  <LogOut size={18} />
                  Log out
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </header>
  )
}

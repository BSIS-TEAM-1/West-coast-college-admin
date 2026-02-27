import { Menu } from 'lucide-react';
import './Navbar.css';

type NavbarProps = {
  username: string;
  onLogout: () => void;
  onMenuToggle?: () => void;
};

export default function Navbar({ username, onMenuToggle }: NavbarProps) {
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
      <div className="navbar-spacer" />
      <div className="navbar-user">
        <span className="navbar-username">{username}</span>
      </div>
    </header>
  );
}

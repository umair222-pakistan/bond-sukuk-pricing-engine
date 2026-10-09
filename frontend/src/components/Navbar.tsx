import { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const links = [
  { to: "/", label: "Home", end: true },
  { to: "/calculators", label: "Calculators" },
  { to: "/pricing", label: "Pricing" },
  { to: "/about", label: "About" },
];

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    setAuthError(null);
    try {
      await signOut();
      setMenuOpen(false);
      navigate("/");
    } catch (cause) {
      setAuthError(cause instanceof Error ? cause.message : "Unable to sign out.");
    }
  }

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <NavLink className="navbar-brand" to="/" onClick={() => setMenuOpen(false)}>
          <span className="brand-mark" aria-hidden="true">N</span>
          <span>NoorFinance</span>
        </NavLink>
        <button
          type="button"
          className="menu-toggle"
          aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span />
          <span />
          <span />
        </button>
        <nav className={`nav-links ${menuOpen ? "nav-open" : ""}`} aria-label="Main navigation">
          {links.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
              onClick={() => setMenuOpen(false)}
            >
              {label}
            </NavLink>
          ))}
          {!loading && user ? (
            <>
              <NavLink className={({ isActive }) => `nav-link${isActive ? " active" : ""}`} to="/dashboard" onClick={() => setMenuOpen(false)}>
                Dashboard
              </NavLink>
              <span className="nav-user" title={user.email ?? undefined}>{user.email}</span>
              <button className="nav-auth-button" type="button" onClick={handleSignOut}>Logout</button>
            </>
          ) : !loading ? (
            <>
              <Link className="nav-login" to="/login" onClick={() => setMenuOpen(false)}>Login</Link>
              <Link className="nav-cta" to="/signup" onClick={() => setMenuOpen(false)}>Sign Up</Link>
            </>
          ) : null}
        </nav>
      </div>
      {authError ? <p className="nav-auth-error" role="alert">{authError}</p> : null}
    </header>
  );
}

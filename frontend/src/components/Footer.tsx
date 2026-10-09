import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <Link className="footer-logo" to="/">NoorFinance</Link>
          <p>Clear tools for thoughtful Islamic finance.</p>
        </div>
        <nav className="footer-links" aria-label="Footer navigation">
          <Link to="/calculators">Calculators</Link>
          <Link to="/pricing">Pricing</Link>
          <Link to="/about">About</Link>
          <Link to="/dashboard">Dashboard</Link>
        </nav>
        <div className="footer-social" aria-label="Social links">
          <a href="https://www.linkedin.com/" aria-label="LinkedIn">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.2 3.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM3.5 9h3.4v11H3.5V9Zm5.6 0h3.2v1.5h.1A3.5 3.5 0 0 1 15.6 8c3.5 0 4.2 2.3 4.2 5.2V20h-3.4v-6c0-1.4 0-3.1-1.9-3.1s-2.2 1.5-2.2 3V20H9.1V9Z" /></svg>
          </a>
          <a href="https://x.com/" aria-label="X">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.9 2H22l-6.8 7.8L23.2 22h-6.3L12 14.6 5.6 22H2.4l7.3-8.4L1.8 2h6.5l4.5 6.8L18.9 2Zm-1.1 18h1.7L7.3 3.9H5.5L17.8 20Z" /></svg>
          </a>
        </div>
        <p className="footer-disclaimer">Educational - Not financial advice</p>
        <p className="footer-copyright">© {new Date().getFullYear()} NoorFinance</p>
      </div>
    </footer>
  );
}

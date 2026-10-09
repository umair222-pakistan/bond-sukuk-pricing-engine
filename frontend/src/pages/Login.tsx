import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { getRememberSession } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";

type LoginLocationState = { from?: { pathname?: string } };

export default function Login() {
  const { user, loading, authError, configurationError, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(getRememberSession());
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (loading) return <div className="auth-loading" role="status">Checking your session…</div>;
  if (user) return <Navigate to="/dashboard" replace />;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signIn(email.trim(), password, rememberMe);
      localStorage.setItem("user_email", email.trim());
      localStorage.setItem("email", email.trim());
      const state = location.state as LoginLocationState | null;
      navigate(state?.from?.pathname ?? "/dashboard", { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to sign in. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <section className="auth-card">
        <Link className="auth-brand" to="/">
          <span className="brand-mark" aria-hidden="true">N</span>
          <span>NoorFinance</span>
        </Link>
        <p className="eyebrow">WELCOME BACK</p>
        <h1>Sign in to your account</h1>
        <p className="auth-intro">Access your saved calculations and workspace.</p>
        {configurationError ? <p className="auth-config-notice" role="status">{configurationError}</p> : null}
        {authError ? <p className="auth-error" role="alert">{authError}</p> : null}
        {error ? <p className="auth-error" role="alert">{error}</p> : null}
        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            Email
            <input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label>
            Password
            <input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          <label className="remember-control">
            <input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} />
            <span>Remember me on this device</span>
          </label>
          <button className="button-primary auth-submit" type="submit" disabled={submitting || Boolean(configurationError)}>
            {submitting ? "Signing in…" : "Sign In"}
          </button>
        </form>
        <p className="auth-switch">Don’t have an account? <Link to="/signup">Create account</Link></p>
      </section>
    </div>
  );
}

import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Signup() {
  const { user, loading, authError, configurationError, signUp } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const requestedNext = new URLSearchParams(location.search).get("next");
  const nextPath = requestedNext?.startsWith("/") && !requestedNext.startsWith("//")
    ? requestedNext
    : "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (loading) return <div className="auth-loading" role="status">Checking your session…</div>;
  if (user) return <Navigate to={nextPath} replace />;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const signedIn = await signUp(email.trim(), password);
      if (signedIn) {
        navigate(nextPath, { replace: true });
      } else {
        setNotice("Account created. Check your email for a confirmation link before signing in.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create your account. Please try again.");
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
        <p className="eyebrow">JOIN NOORFINANCE</p>
        <h1>Create your account</h1>
        <p className="auth-intro">Save your calculations and access your workspace.</p>
        {configurationError ? <p className="auth-config-notice" role="status">{configurationError}</p> : null}
        {authError ? <p className="auth-error" role="alert">{authError}</p> : null}
        {error ? <p className="auth-error" role="alert">{error}</p> : null}
        {notice ? <p className="auth-success" role="status">{notice}</p> : null}
        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            Email
            <input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label>
            Password
            <input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} />
            <span className="auth-field-hint">At least 8 characters.</span>
          </label>
          <label>
            Confirm Password
            <input type="password" autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
          </label>
          <button className="button-primary auth-submit" type="submit" disabled={submitting || Boolean(configurationError)}>
            {submitting ? "Creating account…" : "Create Account"}
          </button>
        </form>
        <p className="auth-switch">Already have an account? <Link to={`/login?next=${encodeURIComponent(nextPath)}`}>Sign in</Link></p>
      </section>
    </div>
  );
}

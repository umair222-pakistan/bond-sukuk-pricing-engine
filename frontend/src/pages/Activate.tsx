import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLicense } from "../hooks/useLicense";
import { supabase } from "../lib/supabaseClient";

export default function Activate() {
  const { user, loading } = useAuth();
  const { hasLicense, isLoading: licenseLoading, refreshLicense } = useLicense();
  const navigate = useNavigate();
  const [licenseKey, setLicenseKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && !licenseLoading && user && hasLicense) {
      navigate("/dashboard", { replace: true });
    }
  }, [hasLicense, licenseLoading, loading, navigate, user]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(false);
    setSubmitting(true);

    try {
      if (!supabase) {
        throw new Error("Supabase is not configured.");
      }
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session) {
        navigate("/login?next=/activate");
        return;
      }

      const normalizedKey = licenseKey.trim().toUpperCase();
      const response = await fetch("/api/license/activate", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ licenseKey: normalizedKey }),
      });
      const result = (await response.json()) as {
        ok?: boolean;
        success?: boolean;
        plan?: string;
        tier?: string;
        error?: string;
      };
      if (!response.ok || result.ok !== true || result.success !== true) {
        throw new Error(result.error ?? "Unable to activate this license key.");
      }

      const normalizedPlan = (result.tier ?? result.plan ?? "pro").toLowerCase();
      if (!["basic", "pro", "enterprise"].includes(normalizedPlan)) {
        throw new Error("The license response contained an unknown subscription tier.");
      }
      console.log("License flow: saving activated tier", normalizedPlan);
      window.localStorage.setItem("noorfinance_tier", normalizedPlan);
      window.localStorage.setItem("noorfinance_plan", normalizedPlan);
      window.localStorage.setItem("tier", normalizedPlan);
      window.localStorage.setItem(
        "isPro",
        String(normalizedPlan === "pro" || normalizedPlan === "enterprise"),
      );
      window.localStorage.setItem("license_key", normalizedKey);
      window.localStorage.setItem("noorfinance-license-key", normalizedKey);
      setSuccess(true);
      await refreshLicense();
      await new Promise((resolve) => window.setTimeout(resolve, 1000));
      navigate("/dashboard", { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to activate this license key.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <section className="auth-card">
        <p className="eyebrow">NOORFINANCE LICENSE</p>
        <h1>Activate your license</h1>
        <p className="auth-intro">
          Enter the license key from your purchase email to unlock your account.
        </p>

        {loading ? <p role="status">Checking your account…</p> : null}
        {!loading && !user ? (
          <p className="auth-error" role="alert">
            Sign in with the email address used for your purchase before activating your key.{" "}
            <Link to="/login?next=/activate">Sign in</Link>
          </p>
        ) : null}
        {user && hasLicense ? (
          <p className="auth-success" role="status">
            Your NoorFinance license is active. You can now access the calculators.
          </p>
        ) : null}
        {error ? <p className="auth-error" role="alert">{error}</p> : null}
        {success ? <p className="auth-success" role="status">License activated successfully.</p> : null}

        <form className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor="license-key">License key</label>
          <input
            id="license-key"
            type="text"
            autoComplete="off"
            autoCapitalize="characters"
            placeholder="NF-XXXXXXXX-…"
            value={licenseKey}
            onChange={(event) => setLicenseKey(event.target.value.toUpperCase())}
            required
            disabled={submitting}
            style={{ fontFamily: "monospace", letterSpacing: "0.04em" }}
          />
          <button
            className="button-primary auth-submit"
            type="submit"
            disabled={submitting || !licenseKey.trim()}
          >
            {submitting ? "Activating…" : "Activate License"}
          </button>
        </form>
      </section>
    </div>
  );
}

import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useSavedCalculations } from "../hooks/useSavedCalculations";
import { useLicense } from "../hooks/useLicense";
import type { SavedCalculation } from "../hooks/useSavedCalculations";

function formatPreview(value: unknown): string {
  if (typeof value === "number") return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
  if (typeof value === "string" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function ResultsPreview({ results }: { results: Record<string, unknown> }) {
  const entries = Object.entries(results).filter(([, value]) => value === null || ["string", "number", "boolean"].includes(typeof value)).slice(0, 4);
  if (!entries.length) return <p className="saved-preview-empty">No result summary available.</p>;
  return (
    <dl className="saved-results-preview">
      {entries.map(([label, value]) => (
        <div key={label}>
          <dt>{label.replace(/([A-Z])/g, " $1").replace(/_/g, " ")}</dt>
          <dd>{formatPreview(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function SavedCalculationCard({
  calculation,
  onDelete,
}: {
  calculation: SavedCalculation;
  onDelete: (id: string) => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await onDelete(calculation.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to delete this calculation.");
      setDeleting(false);
    }
  }

  return (
    <article className="saved-calculation-card">
      <div className="saved-card-heading">
        <div>
          <h2>{calculation.title}</h2>
          <span className="saved-calculator-badge">{calculation.calculator_type}</span>
        </div>
        <time dateTime={calculation.created_at}>
          {new Date(calculation.created_at).toLocaleString()}
        </time>
      </div>
      <ResultsPreview results={calculation.results ?? {}} />
      {error ? <p className="page-error" role="alert">{error}</p> : null}
      <button className="saved-delete-button" type="button" onClick={handleDelete} disabled={deleting}>
        {deleting ? "Deleting…" : "Delete"}
      </button>
    </article>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { plan, tier, isPro, isLoading: subscriptionLoading } = useLicense();
  const { calculations, loading, error, deleteCalculation } = useSavedCalculations();
  const licenseKey =
    window.localStorage.getItem("license_key") ??
    window.localStorage.getItem("noorfinance-license-key");
  const maskedLicenseKey = licenseKey
    ? `NF-****-${licenseKey.slice(-4)}`
    : "No license activated";
  const calculatorAllowance =
    tier === "free"
      ? "1 free calculation"
      : tier === "basic"
        ? "5 core calculators"
        : tier === "pro"
          ? "All available calculators · unlimited"
          : "All calculators · enterprise features";

  return (
    <div className="standard-page">
      <div className="page-heading">
        <p className="eyebrow">YOUR WORKSPACE</p>
        <h1>Your Dashboard</h1>
        <p>Welcome, {user?.email ?? "there"}</p>
      </div>
      <section className="subscription-summary" aria-label="Subscription summary">
        <div>
          <p className="eyebrow">CURRENT PLAN</p>
          <h2>
            <span className={`subscription-plan-badge subscription-plan-${tier}`}>
              {subscriptionLoading ? "Checking…" : plan[0].toUpperCase() + plan.slice(1)}
            </span>
          </h2>
          <p>{calculatorAllowance}</p>
        </div>
        <div>
          <p className="eyebrow">LICENSE KEY</p>
          <p className="masked-license-key">{maskedLicenseKey}</p>
          {!subscriptionLoading && !isPro ? (
            <Link className="button-primary" to="/pricing">
              {tier === "basic" ? "Upgrade to Pro" : "Choose a plan"}
            </Link>
          ) : null}
        </div>
      </section>
      <h2 className="dashboard-section-title">Your calculations</h2>
      {loading ? <p className="saved-loading" role="status">Loading your saved calculations…</p> : null}
      {error ? <p className="page-error" role="alert">{error}</p> : null}
      {!loading && !error && calculations.length ? (
        <div className="saved-calculations-grid">
          {calculations.map((calculation) => (
            <SavedCalculationCard key={calculation.id} calculation={calculation} onDelete={deleteCalculation} />
          ))}
        </div>
      ) : null}
      {!loading && !error && !calculations.length ? (
        <section className="empty-state">
          <span className="empty-mark" aria-hidden="true">↗</span>
          <h2>No saved calculations yet</h2>
          <p>Run a calculation and select “Save to Dashboard” to keep it here.</p>
          <Link className="button-primary" to="/calculators">Explore calculators</Link>
        </section>
      ) : null}
    </div>
  );
}

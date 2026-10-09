import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useSavedCalculations } from "../hooks/useSavedCalculations";
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
  const { calculations, loading, error, deleteCalculation } = useSavedCalculations();

  return (
    <div className="standard-page">
      <div className="page-heading">
        <p className="eyebrow">YOUR WORKSPACE</p>
        <h1>Your Calculations</h1>
        <p>Welcome, {user?.email ?? "there"}</p>
      </div>
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

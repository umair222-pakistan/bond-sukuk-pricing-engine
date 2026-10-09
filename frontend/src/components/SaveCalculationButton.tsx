import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useSavedCalculations } from "../hooks/useSavedCalculations";

type Props = {
  calculatorType: string;
  inputs: Record<string, unknown>;
  results: Record<string, unknown>;
  disabled?: boolean;
};

function displayLabel(key: string): string {
  return key.replace(/([A-Z])/g, " $1").replace(/_/g, " ");
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
  }
  if (typeof value === "string" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export default function SaveCalculationButton({ calculatorType, inputs, results, disabled = false }: Props) {
  const { user, loading: authLoading } = useAuth();
  const { saveCalculation } = useSavedCalculations({ autoFetch: false });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const date = new Date();
      const title = `${calculatorType} - ${date.toLocaleDateString()}`;
      await saveCalculation({ calculator_type: calculatorType, title, inputs, results });
      setMessage("Saved!");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save this calculation.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="save-calculation-control">
        {user ? (
          <button
            className="button-primary save-calculation-button"
            type="button"
            onClick={handleSave}
            disabled={disabled || saving || authLoading}
          >
            {saving ? "Saving…" : "Save to Dashboard"}
          </button>
        ) : (
          <Link className="button-primary save-calculation-button" to="/login">
            {authLoading ? "Checking session…" : "Login to Save"}
          </Link>
        )}
        <button className="button-secondary save-calculation-button pdf-export-button" type="button" onClick={() => window.print()} disabled={disabled}>
          Export PDF
        </button>
        {message ? <span className="save-success" role="status">{message}</span> : null}
        {error ? <span className="page-error save-error" role="alert">{error}</span> : null}
      </div>
      <section className="print-export-content" aria-hidden="true">
        <header className="print-export-header">
          <span className="print-brand-mark">N</span>
          <span>NoorFinance</span>
          <time>{new Date().toLocaleDateString()}</time>
        </header>
        <h1>{calculatorType} calculation</h1>
        <h2>Inputs</h2>
        <dl className="print-export-list">
          {Object.entries(inputs).map(([key, value]) => (
            <div key={key}><dt>{displayLabel(key)}</dt><dd>{displayValue(value)}</dd></div>
          ))}
        </dl>
        <h2>Results</h2>
        {Object.entries(results).map(([key, value]) => (
          Array.isArray(value) && value.every(isObjectRecord) ? (
            <section className="print-export-table-section" key={key}>
              <h3>{displayLabel(key)}</h3>
              {value.length ? (
                <table>
                  <thead>
                    <tr>{Object.keys(value[0]).map((column) => <th key={column}>{displayLabel(column)}</th>)}</tr>
                  </thead>
                  <tbody>
                    {value.map((row, index) => (
                      <tr key={index}>
                        {Object.values(row).map((cell, cellIndex) => <td key={cellIndex}>{displayValue(cell)}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <p>No schedule rows.</p>}
            </section>
          ) : (
            <div className="print-export-result" key={key}>
              <strong>{displayLabel(key)}</strong><span>{displayValue(value)}</span>
            </div>
          )
        ))}
        <p className="print-export-disclaimer">
          Educational estimate only. Not financial, legal, tax, or Shariah advice. Actual terms and outcomes depend on the provider and contract; consult qualified professionals.
        </p>
      </section>
    </>
  );
}

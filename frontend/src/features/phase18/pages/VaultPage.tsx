import { useState } from "react";
import { generateDealPDF } from "../utils/pdfGenerator";
import { COMPARE_STORAGE_KEY, useVault, type VaultDeal } from "../hooks/useVault";

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function readCompareIds(): { ids: string[]; error: string | null } {
  try {
    const stored = window.localStorage.getItem(COMPARE_STORAGE_KEY);
    if (!stored) return { ids: [], error: null };
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed) || !parsed.every((id) => typeof id === "string")) {
      throw new Error("Saved comparison data has an unexpected format.");
    }
    return { ids: parsed.slice(0, 3), error: null };
  } catch (cause) {
    return {
      ids: [],
      error: cause instanceof Error ? cause.message : "Unable to read comparison data.",
    };
  }
}

function saveCompareIds(ids: string[]): void {
  window.localStorage.setItem(COMPARE_STORAGE_KEY, JSON.stringify(ids));
}

export default function VaultPage() {
  const { deals, error: vaultError, deleteDeal } = useVault();
  const [initialCompare] = useState(readCompareIds);
  const [compareIds, setCompareIds] = useState(initialCompare.ids);
  const [compareError, setCompareError] = useState<string | null>(initialCompare.error);
  const [actionError, setActionError] = useState<string | null>(null);

  async function exportDeal(deal: VaultDeal) {
    setActionError(null);
    try {
      await generateDealPDF({ title: deal.title, inputs: deal.inputs, results: deal.results });
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Unable to export this deal as a PDF.");
    }
  }

  function removeDeal(id: string) {
    setActionError(null);
    try {
      deleteDeal(id);
      setCompareIds((current) => current.filter((compareId) => compareId !== id));
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Unable to delete this deal.");
    }
  }

  function toggleCompare(deal: VaultDeal) {
    setCompareError(null);
    const nextIds = compareIds.includes(deal.id)
      ? compareIds.filter((id) => id !== deal.id)
      : [...compareIds, deal.id];
    if (nextIds.length > 3) {
      setCompareError("You can compare up to three deals at a time.");
      return;
    }
    try {
      saveCompareIds(nextIds);
      setCompareIds(nextIds);
    } catch (cause) {
      setCompareError(cause instanceof Error ? cause.message : "Unable to save this comparison.");
    }
  }

  const comparedDeals = compareIds
    .map((id) => deals.find((deal) => deal.id === id))
    .filter((deal): deal is VaultDeal => Boolean(deal));

  return (
    <div className="standard-page">
      <header className="page-heading">
        <p className="eyebrow">PRO WORKSPACE</p>
        <h1>Your Vault</h1>
        <p>Saved estimates are stored in this browser.</p>
      </header>
      {vaultError ? <p className="page-error" role="alert">{vaultError}</p> : null}
      {actionError ? <p className="page-error" role="alert">{actionError}</p> : null}
      {deals.length ? (
        <div className="saved-calculations-grid">
          {deals.map((deal) => (
            <article className="saved-calculation-card" key={deal.id}>
              <div className="saved-card-heading">
                <div>
                  <h2>{deal.title}</h2>
                  <span className="saved-calculator-badge">{deal.calculator_type}</span>
                </div>
                <time dateTime={deal.created_at}>{new Date(deal.created_at).toLocaleString()}</time>
              </div>
              <dl className="saved-results-preview">
                {Object.entries(deal.results).slice(0, 4).map(([label, value]) => (
                  <div key={label}><dt>{label}</dt><dd>{formatValue(value)}</dd></div>
                ))}
              </dl>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <label>
                  <input
                    type="checkbox"
                    checked={compareIds.includes(deal.id)}
                    onChange={() => toggleCompare(deal)}
                    disabled={!compareIds.includes(deal.id) && compareIds.length >= 3}
                  />
                  Compare
                </label>
                <button
                  type="button"
                  onClick={() => void exportDeal(deal)}
                >
                  Export PDF
                </button>
                <button type="button" onClick={() => removeDeal(deal.id)}>Delete</button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <section className="empty-state">
          <h2>Your vault is empty</h2>
          <p>Use Save to Vault on a calculator result to keep an estimate here.</p>
        </section>
      )}
      {compareError ? <p className="page-error" role="alert">{compareError}</p> : null}
      {comparedDeals.length ? (
        <section style={{ marginTop: 32, overflowX: "auto" }} aria-labelledby="deal-comparison-title">
          <h2 id="deal-comparison-title">Compare selected deals ({comparedDeals.length}/3)</h2>
          <table className="cashflow-table">
            <thead>
              <tr><th>Result</th>{comparedDeals.map((deal) => <th key={deal.id}>{deal.title}</th>)}</tr>
            </thead>
            <tbody>
              {[...new Set(comparedDeals.flatMap((deal) => Object.keys(deal.results)))].map((key) => (
                <tr key={key}>
                  <th>{key}</th>
                  {comparedDeals.map((deal) => <td key={deal.id}>{formatValue(deal.results[key])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}

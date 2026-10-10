import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useVault, COMPARE_STORAGE_KEY, type VaultDeal } from "../hooks/useVault";
import { generateComparisonPdf } from "../utils/pdfGenerator";

type Metric = { label: string; keys: string[] };

const summaryMetrics: Metric[] = [
  { label: "Monthly payment", keys: ["monthlyPayment", "monthlyInstallment", "monthlyContribution"] },
  { label: "Total profit", keys: ["totalProfit", "profitAmount", "totalRent", "totalProfitOrRent"] },
  { label: "Yield", keys: ["yield", "yieldRate", "profitRate", "profitRatePercent", "annualRiskRatePercent"] },
  { label: "IRR", keys: ["irr", "internalRateOfReturn"] },
];

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
  if (typeof value === "object") return "—";
  return String(value);
}

function valueFor(deal: VaultDeal, key: string): unknown {
  if (key.startsWith("input:")) return deal.inputs[key.slice(6)];
  if (key.startsWith("result:")) return deal.results[key.slice(7)];
  for (const metric of summaryMetrics) {
    if (metric.label === key) {
      for (const name of metric.keys) {
        const value = deal.results[name] ?? deal.inputs[name];
        if (value !== undefined && value !== null) return value;
      }
    }
  }
  return undefined;
}

function percentageDifference(value: unknown, baseline: unknown): string {
  if (typeof value !== "number" || typeof baseline !== "number") return "—";
  if (baseline === 0) return value === 0 ? "0.0%" : "—";
  return `${(((value - baseline) / Math.abs(baseline)) * 100).toFixed(1)}%`;
}

function comparisonRows(deals: VaultDeal[], kind: "input" | "result"): string[] {
  const keys = new Set<string>();
  for (const deal of deals) {
    const source = kind === "input" ? deal.inputs : deal.results;
    Object.entries(source).forEach(([key, value]) => {
      if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
        keys.add(`${kind}:${key}`);
      }
    });
  }
  if (kind === "result") {
    for (const metric of summaryMetrics) {
      if (deals.some((deal) => metric.keys.some((key) => deal.results[key] !== undefined || deal.inputs[key] !== undefined))) {
        keys.add(metric.label);
      }
    }
  }
  return [...keys];
}

export default function ComparePage() {
  const { deals, error } = useVault();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedIds = searchParams.get("ids");
  const [initialSelection] = useState((): { ids: string[]; error: string | null } => {
    const fromUrl = requestedIds ? [...new Set(requestedIds.split(",").filter(Boolean))] : [];
    if (fromUrl.length) return { ids: fromUrl.slice(0, 3), error: null };
    try {
      const stored: unknown = JSON.parse(window.localStorage.getItem(COMPARE_STORAGE_KEY) ?? "[]");
      if (!Array.isArray(stored) || !stored.every((id) => typeof id === "string")) {
        throw new Error("Saved comparison selection has an unexpected format.");
      }
      return { ids: stored.slice(0, 3), error: null };
    } catch (cause) {
      return {
        ids: [],
        error: cause instanceof Error ? cause.message : "Unable to read saved comparison selection.",
      };
    }
  });
  const [selectedIds, setSelectedIds] = useState(initialSelection.ids);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    if (requestedIds === null) return;
    const ids = [...new Set(requestedIds.split(",").filter(Boolean))].slice(0, 3);
    setSelectedIds(ids);
    try {
      window.localStorage.setItem(COMPARE_STORAGE_KEY, JSON.stringify(ids));
    } catch {
      setExportError("Unable to save comparison selection in this browser.");
    }
  }, [requestedIds]);

  const selectedDeals = useMemo(
    () => selectedIds.map((id) => deals.find((deal) => deal.id === id)).filter((deal): deal is VaultDeal => Boolean(deal)),
    [deals, selectedIds],
  );

  function toggleSelection(deal: VaultDeal) {
    const next = selectedIds.includes(deal.id)
      ? selectedIds.filter((id) => id !== deal.id)
      : selectedIds.length < 3 ? [...selectedIds, deal.id] : selectedIds;
    setSelectedIds(next);
    setSearchParams(next.length ? { ids: next.join(",") } : {});
    setExportError(null);
    try {
      window.localStorage.setItem(COMPARE_STORAGE_KEY, JSON.stringify(next));
    } catch (cause) {
      setExportError(cause instanceof Error ? cause.message : "Unable to save comparison selection.");
    }
  }

  const inputRows = comparisonRows(selectedDeals, "input");
  const resultRows = comparisonRows(selectedDeals, "result");

  async function exportComparison() {
    setExportError(null);
    try {
      await generateComparisonPdf(selectedDeals);
    } catch (cause) {
      setExportError(cause instanceof Error ? cause.message : "Unable to export this comparison.");
    }
  }

  function renderTable(title: string, rows: string[]) {
    if (!rows.length || !selectedDeals.length) return null;
    return (
      <section style={{ marginTop: 24, overflowX: "auto" }} aria-label={title}>
        <h2>{title}</h2>
        <table className="cashflow-table">
          <thead>
            <tr><th>Measure</th>{selectedDeals.map((deal) => <th key={deal.id}>{deal.title}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((key) => {
              const baseline = valueFor(selectedDeals[0], key);
              const label = key.startsWith("input:")
                ? key.slice(6)
                : key.startsWith("result:") ? key.slice(7) : key;
              return (
                <tr key={key}>
                  <th>{label.replace(/([A-Z])/g, " $1").replace(/_/g, " ")}</th>
                  {selectedDeals.map((deal, index) => {
                    const value = valueFor(deal, key);
                    return (
                      <td key={deal.id}>
                        {formatValue(value)}
                        {index > 0 && typeof value === "number" && typeof baseline === "number"
                          ? <small style={{ display: "block" }}>{percentageDifference(value, baseline)} vs first</small>
                          : null}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    );
  }

  return (
    <div className="standard-page">
      <header className="page-heading">
        <p className="eyebrow">PRO WORKSPACE</p>
        <h1>Compare deals</h1>
        <p>Select up to three local vault deals for a side-by-side review.</p>
      </header>
      {error ? <p className="page-error" role="alert">{error}</p> : null}
      {initialSelection.error ? <p className="page-error" role="alert">{initialSelection.error}</p> : null}
      {exportError ? <p className="page-error" role="alert">{exportError}</p> : null}
      <section aria-label="Select deals to compare">
        {deals.map((deal) => (
          <label key={deal.id} style={{ display: "block", padding: "8px 0" }}>
            <input
              type="checkbox"
              checked={selectedIds.includes(deal.id)}
              onChange={() => toggleSelection(deal)}
              disabled={!selectedIds.includes(deal.id) && selectedIds.length >= 3}
            />
            {" "}{deal.title} <span className="saved-calculator-badge">{deal.calculator_type}</span>
          </label>
        ))}
        {!deals.length ? (
          <p>Your vault is empty. <Link to="/vault">Save or import a deal in the vault</Link> to compare it.</p>
        ) : null}
      </section>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 16 }}>
        <span>{selectedDeals.length} of 3 selected</span>
        <button type="button" disabled={!selectedDeals.length} onClick={() => void exportComparison()}>
          Export Comparison PDF
        </button>
      </div>
      {renderTable("Inputs", inputRows)}
      {renderTable("Results & financial metrics", resultRows)}
    </div>
  );
}

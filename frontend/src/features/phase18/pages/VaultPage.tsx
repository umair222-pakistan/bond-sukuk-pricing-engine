import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useVault, type VaultDeal } from "../hooks/useVault";
import { generateDealPDF, generateComparisonPdf } from "../utils/pdfGenerator";
import { exportDealsToCSV } from "../../../lib/excelGenerator";

type VaultFilter = "All" | "Debt" | "Equity" | "Social";
type VaultSort = "newest" | "amount";

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function dealAmount(deal: VaultDeal): number {
  const amountKeys = /amount|cost|capital|price|face|coverage|wealth|principal|investment|project/i;
  const entries = Object.entries(deal.inputs);
  const match = entries.find(([key, value]) => amountKeys.test(key) && typeof value === "number");
  return match && typeof match[1] === "number" ? match[1] : 0;
}

function categoryOf(deal: VaultDeal): Exclude<VaultFilter, "All"> {
  const type = deal.calculator_type.toLowerCase();
  if (/musharaka|mudaraba|equity/.test(type)) return "Equity";
  if (/zakat|takaful|social/.test(type)) return "Social";
  return "Debt";
}

export default function VaultPage() {
  const { deals, error: vaultError, deleteDeal, updateDeal, duplicateDeal } = useVault();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<VaultFilter>("All");
  const [sort, setSort] = useState<VaultSort>("newest");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [tagDrafts, setTagDrafts] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const visibleDeals = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return deals
      .filter((deal) => filter === "All" || categoryOf(deal) === filter)
      .filter((deal) => !needle || [
        deal.title,
        deal.calculator_type,
        ...Object.values(deal.inputs).map(formatValue),
        ...(deal.tags ?? []),
      ].some((value) => value.toLowerCase().includes(needle)))
      .sort((left, right) => sort === "newest"
        ? new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
        : dealAmount(right) - dealAmount(left));
  }, [deals, filter, query, sort]);

  function reportActionError(cause: unknown, fallback: string) {
    setActionError(cause instanceof Error ? cause.message : fallback);
    setStatus(null);
  }

  async function exportDeal(deal: VaultDeal) {
    setActionError(null);
    setStatus(null);
    try {
      await generateDealPDF({ title: deal.title, inputs: deal.inputs, results: deal.results });
    } catch (cause) {
      reportActionError(cause, "Unable to export this deal as a PDF.");
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => current.includes(id)
      ? current.filter((selectedId) => selectedId !== id)
      : [...current, id]);
  }

  function bulkDelete() {
    setActionError(null);
    setStatus(null);
    try {
      for (const id of selectedIds) deleteDeal(id);
      setStatus(`${selectedIds.length} deal${selectedIds.length === 1 ? "" : "s"} deleted.`);
      setSelectedIds([]);
    } catch (cause) {
      reportActionError(cause, "Unable to delete the selected deals.");
    }
  }

  async function exportSelected() {
    setActionError(null);
    setStatus(null);
    const selectedDeals = deals.filter((deal) => selectedIds.includes(deal.id));
    try {
      await generateComparisonPdf(selectedDeals);
    } catch (cause) {
      reportActionError(cause, "Unable to export selected deals.");
    }
  }

  function exportAll() {
    setActionError(null);
    setStatus(null);
    try {
      exportDealsToCSV(deals);
    } catch (cause) {
      reportActionError(cause, "Unable to export vault deals as CSV.");
    }
  }

  function saveTags(deal: VaultDeal) {
    setActionError(null);
    setStatus(null);
    try {
      const tags = (tagDrafts[deal.id] ?? (deal.tags ?? []).join(","))
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
      updateDeal(deal.id, { tags: [...new Set(tags)] });
      setStatus("Deal tags saved.");
    } catch (cause) {
      reportActionError(cause, "Unable to save deal tags.");
    }
  }

  function duplicate(deal: VaultDeal) {
    setActionError(null);
    setStatus(null);
    try {
      duplicateDeal(deal.id);
      setStatus("Deal duplicated.");
    } catch (cause) {
      reportActionError(cause, "Unable to duplicate this deal.");
    }
  }

  return (
    <div className="standard-page">
      <header className="page-heading">
        <p className="eyebrow">PRO WORKSPACE</p>
        <h1>Your Vault</h1>
        <p>Saved estimates are stored in this browser.</p>
      </header>
      {vaultError ? <p className="page-error" role="alert">{vaultError}</p> : null}
      {actionError ? <p className="page-error" role="alert">{actionError}</p> : null}
      {status ? <p role="status">{status}</p> : null}
      <section aria-label="Vault tools" style={{ display: "grid", gap: 12, marginBottom: 20 }}>
        <label>
          Search deals
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search calculator, title, tag, or amount"
          />
        </label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          <label>Category
            <select value={filter} onChange={(event) => setFilter(event.target.value as VaultFilter)}>
              <option>All</option><option>Debt</option><option>Equity</option><option>Social</option>
            </select>
          </label>
          <label>Sort
            <select value={sort} onChange={(event) => setSort(event.target.value as VaultSort)}>
              <option value="newest">Newest</option><option value="amount">Amount High-Low</option>
            </select>
          </label>
          <button type="button" onClick={exportAll} disabled={!deals.length}>Export All → CSV</button>
          <Link className="button-secondary" to="/compare">Compare deals</Link>
        </div>
      </section>
      {selectedIds.length ? (
        <section aria-label="Bulk deal actions" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
          <span>{selectedIds.length} selected</span>
          <button type="button" onClick={() => void exportSelected()}>Export selected → PDF</button>
          <button type="button" onClick={bulkDelete}>Delete selected</button>
        </section>
      ) : null}
      {visibleDeals.length ? (
        <div className="saved-calculations-grid">
          {visibleDeals.map((deal) => (
            <article className="saved-calculation-card" key={deal.id}>
              <div className="saved-card-heading">
                <div>
                  <h2>{deal.title}</h2>
                  <span className="saved-calculator-badge">{deal.calculator_type}</span>
                  <span style={{ marginLeft: 8 }}>{categoryOf(deal)}</span>
                </div>
                <time dateTime={deal.created_at}>{new Date(deal.created_at).toLocaleString()}</time>
              </div>
              <dl className="saved-results-preview">
                {Object.entries(deal.results).filter(([, value]) => !Array.isArray(value)).slice(0, 4).map(([label, value]) => (
                  <div key={label}><dt>{label}</dt><dd>{formatValue(value)}</dd></div>
                ))}
              </dl>
              <p>Tags: {(deal.tags ?? []).join(", ") || "None"}</p>
              <label>
                Edit tags (comma separated)
                <input
                  value={tagDrafts[deal.id] ?? (deal.tags ?? []).join(", ")}
                  onChange={(event) => setTagDrafts((current) => ({ ...current, [deal.id]: event.target.value }))}
                />
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                <label>
                  <input type="checkbox" checked={selectedIds.includes(deal.id)} onChange={() => toggleSelected(deal.id)} />
                  Select
                </label>
                <button type="button" onClick={() => saveTags(deal)}>Save tags</button>
                <button type="button" onClick={() => void exportDeal(deal)}>Export PDF</button>
                <button type="button" onClick={() => duplicate(deal)}>Duplicate Deal</button>
                <button type="button" onClick={() => {
                  try {
                    deleteDeal(deal.id);
                    setSelectedIds((current) => current.filter((id) => id !== deal.id));
                  } catch (cause) {
                    reportActionError(cause, "Unable to delete this deal.");
                  }
                }}>Delete</button>
              </div>
            </article>
          ))}
        </div>
      ) : deals.length ? (
        <section className="empty-state"><h2>No matching deals</h2><p>Adjust your search or category filter.</p></section>
      ) : (
        <section className="empty-state">
          <h2>Your vault is empty</h2>
          <p>Use Save to Vault on a calculator result to keep an estimate here.</p>
        </section>
      )}
    </div>
  );
}

import { useParams } from "react-router-dom";
import { useVault } from "../hooks/useVault";

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default function SharedDealPage() {
  const { token } = useParams<{ token: string }>();
  const { deals } = useVault();
  const deal = deals.find((savedDeal) => savedDeal.share_token === token);

  return (
    <div className="standard-page">
      {deal ? (
        <>
          <header className="page-heading">
            <p className="eyebrow">READ-ONLY ESTIMATE</p>
            <h1>{deal.title}</h1>
            <p>{deal.calculator_type} · {new Date(deal.created_at).toLocaleDateString()}</p>
          </header>
          <section className="saved-calculation-card">
            <h2>Inputs</h2>
            <dl className="saved-results-preview">
              {Object.entries(deal.inputs).map(([label, value]) => (
                <div key={label}><dt>{label}</dt><dd>{formatValue(value)}</dd></div>
              ))}
            </dl>
            <h2>Results</h2>
            <dl className="saved-results-preview">
              {Object.entries(deal.results).map(([label, value]) => (
                <div key={label}><dt>{label}</dt><dd>{formatValue(value)}</dd></div>
              ))}
            </dl>
            <p>Read-only view. This link resolves on the browser where the deal is stored.</p>
          </section>
        </>
      ) : (
        <section className="empty-state">
          <h1>Shared deal not found</h1>
          <p>This link may be unavailable because vault data is stored locally in the browser that created it.</p>
        </section>
      )}
    </div>
  );
}

import { Link } from "react-router-dom";
import type { SubscriptionTier } from "../hooks/useLicense";

type PaywallProps = {
  tier: SubscriptionTier;
  onClose?: () => void;
};

export default function Paywall({ tier, onClose }: PaywallProps) {
  const label = tier === "basic" ? "Basic" : tier === "pro" ? "Pro" : "Enterprise";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="paywall-title"
      className="paywall-backdrop"
      onClick={onClose}
    >
      <section className="paywall-dialog" onClick={(event) => event.stopPropagation()}>
        {onClose ? (
          <button className="paywall-close" type="button" aria-label="Close" onClick={onClose}>
            ×
          </button>
        ) : null}
        <p className="eyebrow">PLAN REQUIRED</p>
        <h2 id="paywall-title">{label} unlocks this calculator</h2>
        <p>Choose a plan to unlock the tools and calculation limits included with it.</p>
        <div className="paywall-actions">
          <Link className="button-primary" to="/pricing">View plans</Link>
          <Link className="button-secondary" to="/activate">Activate a license</Link>
        </div>
      </section>
    </div>
  );
}

import { Link } from "react-router-dom";

const tiers = [
  {
    name: "Free",
    price: "$0",
    cadence: " / forever",
    description: "One calculator to get started.",
    features: ["1 calculator", "Sukuk vs Bond pricing", "Cash-flow comparison", "Local calculation history"],
    featured: false,
    action: "Start Free",
    href: "/calculators/bond-sukuk",
  },
  {
    name: "Pro",
    price: "$19",
    cadence: "/ month",
    description: "For deeper financial exploration.",
    features: ["All calculators", "PDF export", "CSV cash-flow export", "Saved calculation history"],
    featured: true,
    action: "Start Pro",
    href: "/calculators",
  },
  {
    name: "Enterprise",
    price: "$99",
    cadence: "/ month",
    description: "For organizations building at scale.",
    features: ["All Pro features", "API access", "White-label experience", "Organization support"],
    featured: false,
    action: "Explore Enterprise",
    href: "/about",
  },
];

export default function Pricing() {
  return (
    <div className="standard-page">
      <div className="page-heading centered-heading">
        <p className="eyebrow">SIMPLE, TRANSPARENT PRICING</p>
        <h1>Start free. Grow when you’re ready.</h1>
        <p>Choose the plan that fits the way you explore Islamic finance.</p>
      </div>
      <div className="pricing-grid">
        {tiers.map((tier) => (
          <article className={`pricing-card${tier.featured ? " pricing-featured" : ""}`} key={tier.name}>
            {tier.featured ? <span className="popular-label">MOST POPULAR</span> : null}
            <p className="pricing-name">{tier.name}</p>
            <p className="pricing-price">{tier.price}<span>{tier.cadence}</span></p>
            <p className="pricing-description">{tier.description}</p>
            <ul>{tier.features.map((feature) => <li key={feature}><span aria-hidden="true">✓</span>{feature}</li>)}</ul>
            <Link className={tier.featured ? "button-primary pricing-action" : "button-secondary pricing-action"} to={tier.href}>
              {tier.action}
            </Link>
          </article>
        ))}
      </div>
      <p className="pricing-note">Plans are displayed for preview. Online checkout is not enabled yet.</p>
    </div>
  );
}

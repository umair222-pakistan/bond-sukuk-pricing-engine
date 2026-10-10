import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function resolveCheckoutUrl(configured: string | undefined, fallback: string): string | null {
  const candidate = configured?.trim() || fallback;
  if (!candidate || candidate === "#") return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

const plans = [
  {
    name: "Basic",
    plan: "basic",
    price: "2,499",
    period: "/month",
    tag: "For learners",
    features: [
      "Five core calculators",
      "Shariah PDF reports",
      "AAOIFI compliant badge",
      "Email support",
    ],
    url: resolveCheckoutUrl(
      import.meta.env.NEXT_PUBLIC_LEMON_BASIC_URL || import.meta.env.VITE_LEMON_BASIC_URL,
      "https://noorfinance-pk.lemonsqueezy.com/checkout/buy/a62422df-aef7-4a72-8054-2018913c3549",
    ),
    cta: "Get Basic",
    popular: false,
  },
  {
    name: "Pro",
    plan: "pro",
    price: "5,499",
    period: "/month",
    tag: "For businesses",
    features: [
      "Every available calculator",
      "Unlimited calculations",
      "Team (5 users) + API",
      "Priority WhatsApp support",
    ],
    url: resolveCheckoutUrl(
      import.meta.env.NEXT_PUBLIC_LEMON_PRO_URL || import.meta.env.VITE_LEMON_PRO_URL,
      "https://noorfinance-pk.lemonsqueezy.com/checkout/buy/4103e815-a388-4058-854b-faaa5d96317c",
    ),
    cta: "Get Pro",
    popular: true,
  },
  {
    name: "Enterprise",
    plan: "enterprise",
    price: "99,999",
    period: "lifetime",
    tag: "For banks",
    features: [
      "Everything in Pro",
      "Custom Sukuk engine",
      "On-premise deployment option",
      "Shariah Board consultation",
    ],
    url: resolveCheckoutUrl(
      import.meta.env.NEXT_PUBLIC_LEMON_ENTERPRISE_URL || import.meta.env.VITE_LEMON_ENTERPRISE_URL,
      "https://noorfinance-pk.lemonsqueezy.com/checkout/buy/96677fb3-2beb-44c4-93e3-02265efc66e8",
    ),
    cta: "Get Enterprise",
    popular: false,
  },
];

if (
  !(import.meta.env.NEXT_PUBLIC_LEMON_BASIC_URL || import.meta.env.VITE_LEMON_BASIC_URL) ||
  !(import.meta.env.NEXT_PUBLIC_LEMON_PRO_URL || import.meta.env.VITE_LEMON_PRO_URL) ||
  !(import.meta.env.NEXT_PUBLIC_LEMON_ENTERPRISE_URL || import.meta.env.VITE_LEMON_ENTERPRISE_URL)
) {
  console.warn(
    "License flow: set NEXT_PUBLIC_LEMON_BASIC_URL, NEXT_PUBLIC_LEMON_PRO_URL, and NEXT_PUBLIC_LEMON_ENTERPRISE_URL; using store defaults for missing values.",
  );
}

export default function Pricing() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [checkoutUnavailable, setCheckoutUnavailable] = useState(false);

  function handleBuy(url: string | null, plan: string) {
    if (!url) {
      console.warn(`License flow: no valid Lemon Squeezy checkout URL configured for ${plan}.`);
      setCheckoutUnavailable(true);
      return;
    }
    if (!user?.id || !user.email) {
      navigate("/signup?next=/pricing");
      return;
    }
    const checkoutUrl = new URL(url);
    checkoutUrl.searchParams.set("checkout[email]", user.email.trim());
    checkoutUrl.searchParams.set("checkout[custom][user_id]", user.id);
    checkoutUrl.searchParams.set("checkout[custom][email]", user.email.trim());
    checkoutUrl.searchParams.set("checkout[custom][plan]", plan);
    window.location.assign(checkoutUrl.toString());
  }

  return (
    <div className="standard-page">
      <div className="page-heading centered-heading">
        <p className="eyebrow">SIMPLE, TRANSPARENT PRICING</p>
        <h1>Choose the plan for your work.</h1>
        <p>Subscriptions unlock the calculators and services included in each tier.</p>
      </div>
      <div className="pricing-grid">
        {plans.map((plan) => (
          <article
            className={`pricing-card${plan.popular ? " pricing-featured" : ""}`}
            key={plan.name}
          >
            {plan.popular ? <span className="popular-label">MOST POPULAR</span> : null}
            <p className="pricing-name">{plan.name}</p>
            <p className="pricing-price">
              PKR {plan.price}
              <span>{plan.period}</span>
            </p>
            <p className="pricing-description">{plan.tag}</p>
            <ul>
              {plan.features.map((feature) => (
                <li key={feature}><span aria-hidden="true">✓</span>{feature}</li>
              ))}
            </ul>
            <button
              className={plan.popular ? "button-primary pricing-action" : "button-secondary pricing-action"}
              type="button"
              onClick={() => handleBuy(plan.url, plan.plan)}
            >
              {plan.url ? plan.cta : "Contact support"}
            </button>
          </article>
        ))}
      </div>
      {plans.some((plan) => !plan.url) || checkoutUnavailable ? (
        <p className="pricing-note">
          Checkout is unavailable for one or more plans. Please contact NoorFinance support or
          configure valid HTTPS Lemon Squeezy checkout URLs in the deployment environment.
        </p>
      ) : null}
    </div>
  );
}

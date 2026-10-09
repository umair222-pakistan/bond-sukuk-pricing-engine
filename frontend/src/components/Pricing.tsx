const pricingPlans = [
  {
    name: "Basic",
    price: "PKR 2,499",
    period: "/month",
    desc: "For individuals",
    features: ["All calculators", "PDF reports"],
    link: "https://noorfinance-pk.lemonsqueezy.com/checkout/buy/a62422df-aef7-4a72-8054-2018913c3549",
    popular: false
  },
  {
    name: "Pro",
    price: "PKR 5,499",
    period: "/month",
    desc: "For businesses",
    features: ["Everything in Basic", "Unlimited", "Team access", "API"],
    link: "https://noorfinance-pk.lemonsqueezy.com/checkout/buy/4103e815-a388-4058-854b-faaa5d96317c",
    popular: true
  },
  {
    name: "Enterprise",
    price: "PKR 99,999",
    period: " one-time",
    desc: "For banks",
    features: ["Everything in Pro", "Custom engine", "On-premise"],
    link: "https://noorfinance-pk.lemonsqueezy.com/checkout/buy/96677fb3-2beb-44c4-93e3-02265efc66e8",
    popular: false
  }
];

export default function Pricing() {
  return (
    <section className="py-20 bg-white">
      <h2 className="text-4xl font-bold text-center mb-12">Simple Pricing</h2>
      <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto px-4">
        {pricingPlans.map((plan) => (
          <div key={plan.name} className={`border rounded-2xl p-8 ${plan.popular ? 'border-green-600 shadow-xl' : ''}`}>
            <h3 className="text-2xl font-bold">{plan.name}</h3>
            <p>{plan.desc}</p>
            <div className="my-6"><span className="text-4xl font-bold">{plan.price}</span><span>{plan.period}</span></div>
            <ul>{plan.features.map(f => <li key={f}>✅ {f}</li>)}</ul>
            <a href={plan.link} target="_blank" rel="noreferrer" className="block text-center bg-green-600 text-white py-3 rounded-xl mt-4">Get {plan.name}</a>
          </div>
        ))}
      </div>
    </section>
  );
}

const plans = [
  {
    name: "Basic",
    price: "2,499",
    period: "/month",
    desc: "Perfect for individuals & students learning Islamic finance",
    features: ["All 5 calculators (Zakat, Murabaha, Ijara, etc)", "Shariah PDF reports with references", "GCC & Pakistan AAOIFI compliant", "Email support"],
    link: "https://noorfinance-pk.lemonsqueezy.com/checkout/buy/a62422df-aef7-4a72-8054-2018913c3549",
    cta: "Get Basic",
    popular: false
  },
  {
    name: "Pro",
    price: "5,499",
    period: "/month",
    desc: "For businesses, startups & finance professionals",
    features: ["Everything in Basic", "Unlimited calculations", "Team access (5 users)", "API access for integration", "Priority support + WhatsApp"],
    link: "https://noorfinance-pk.lemonsqueezy.com/checkout/buy/4103e815-a388-4058-854b-faaa5d96317c",
    cta: "Get Pro - Most Popular",
    popular: true
  },
  {
    name: "Enterprise",
    price: "99,999",
    period: " one-time",
    desc: "For Islamic banks, fintechs & institutions",
    features: ["Everything in Pro", "Custom Sukuk pricing engine", "On-premise deployment", "Unlimited team members", "Shariah Board consultation"],
    link: "https://noorfinance-pk.lemonsqueezy.com/checkout/buy/96677fb3-2beb-44c4-93e3-02265efc66e8",
    cta: "Get Enterprise",
    popular: false
  }
];

export default function Pricing() {
  return (
    <div className="w-full bg-[#FFFEF9] py-16 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-[#0A2A12] mb-4">Simple, Shariah-Compliant Pricing</h1>
          <p className="text-gray-600 text-lg">No hidden fees. Riba-free. Cancel anytime.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {plans.map((plan) => (
            <div key={plan.name} className={`relative bg-white rounded-3xl p-8 flex flex-col ${plan.popular ? 'border-2 border-[#0A2A12] shadow-2xl scale-105' : 'border border-gray-200 shadow-lg'}`}>
              {plan.popular && <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-[#0A2A12] text-white px-4 py-1 rounded-full text-sm font-bold">Most Popular</div>}
              <h3 className="text-2xl font-bold text-[#0A2A12]">{plan.name}</h3>
              <p className="text-sm text-gray-500 mt-2 min-h-[40px]">{plan.desc}</p>
              <div className="mt-6 mb-6"><span className="text-4xl font-extrabold text-[#0A2A12]">PKR {plan.price}</span><span className="text-gray-500 text-sm">{plan.period}</span></div>
              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map((f) => <li key={f} className="flex gap-2 text-sm text-gray-700"><span className="text-green-600 font-bold">✓</span> {f}</li>)}
              </ul>
              <a href={plan.link} target="_blank" rel="noreferrer" className={`w-full text-center py-4 rounded-xl font-bold transition ${plan.popular ? 'bg-[#0A2A12] text-white hover:bg-black' : 'bg-white border-2 border-[#0A2A12] text-[#0A2A12] hover:bg-[#0A2A12] hover:text-white'}`}>{plan.cta} →</a>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

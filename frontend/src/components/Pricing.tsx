import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Pricing() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const handleBuy = (url: string) => {
    const email = user?.email?.trim();
    if (!email || !user?.id) {
      navigate("/signup?next=/pricing");
      return;
    }

    const checkoutUrl = new URL(url);
    checkoutUrl.searchParams.set("checkout[email]", email);
    checkoutUrl.searchParams.set("checkout[custom][user_id]", user.id);
    checkoutUrl.searchParams.set("checkout[custom][email]", email);
    window.location.href = checkoutUrl.toString();
  };

  const plans = [
    { name: "Basic", price: "2,499", period: "/month", tag: "For learners", features: ["All 5 calculators (Zakat, Murabaha, Ijara)", "Shariah PDF reports", "AAOIFI compliant", "Email support"], link: "https://noorfinance-pk.lemonsqueezy.com/checkout/buy/a62422df-aef7-4a72-8054-2018913c3549", cta: "Get Basic", popular: false, color: "#ffffff" },
    { name: "Pro", price: "5,499", period: "/month", tag: "For businesses", features: ["Everything in Basic", "Unlimited calculations", "Team (5 users) + API", "Priority WhatsApp support"], link: "https://noorfinance-pk.lemonsqueezy.com/checkout/buy/4103e815-a388-4058-854b-faaa5d96317c", cta: "Get Pro", popular: true, color: "#FFFEF9" },
    { name: "Enterprise", price: "99,999", period: " lifetime", tag: "For banks", features: ["Everything in Pro", "Custom Sukuk engine", "On-premise deployment", "Shariah Board consultation"], link: "https://noorfinance-pk.lemonsqueezy.com/checkout/buy/96677fb3-2beb-44c4-93e3-02265efc66e8", cta: "Get Enterprise", popular: false, color: "#ffffff" }
  ];

  return (
    <div style={{background: "#FFFEF9", minHeight: "100vh", padding: "60px 20px"}}>
      <div style={{maxWidth: "1200px", margin: "0 auto", textAlign: "center", marginBottom: "50px"}}>
        <h1 style={{fontSize: "48px", fontWeight: "900", color: "#0A2A12"}}>Simple, Shariah-Compliant Pricing</h1>
        <p style={{color: "#666", fontSize: "18px", marginTop: "10px"}}>No hidden fees. Riba-free. Cancel anytime.</p>
      </div>
      <div style={{maxWidth: "1200px", margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "30px"}}>
        {plans.map((p) => (
          <div key={p.name} style={{background: "white", borderRadius: "24px", padding: "32px", border: p.popular ? "3px solid #0A2A12" : "1px solid #e5e7eb", boxShadow: p.popular ? "0 20px 40px rgba(0,0,0,0.15)" : "0 4px 20px rgba(0,0,0,0.05)", transform: p.popular ? "scale(1.05)" : "none", position: "relative"}}>
            {p.popular && <div style={{position: "absolute", top: "-14px", left: "50%", transform: "translateX(-50%)", background: "#0A2A12", color: "white", padding: "4px 16px", borderRadius: "20px", fontSize: "12px", fontWeight: "bold"}}>MOST POPULAR</div>}
            <h3 style={{fontSize: "24px", fontWeight: "800", color: "#0A2A12"}}>{p.name}</h3>
            <p style={{color: "#888", fontSize: "14px", marginTop: "8px"}}>{p.tag}</p>
            <div style={{margin: "24px 0"}}><span style={{fontSize: "36px", fontWeight: "900", color: "#0A2A12"}}>PKR {p.price}</span><span style={{color: "#888"}}>{p.period}</span></div>
            <ul style={{textAlign: "left", marginBottom: "24px", listStyle: "none", padding: 0}}>{p.features.map((f) => <li key={f} style={{marginBottom: "10px", fontSize: "14px"}}>✓ {f}</li>)}</ul>
            <button
              type="button"
              onClick={() => handleBuy(p.link)}
              style={{display: "block", width: "100%", textAlign: "center", background: p.popular ? "#0A2A12" : "white", color: p.popular ? "white" : "#0A2A12", border: p.popular ? "none" : "2px solid #0A2A12", padding: "14px", borderRadius: "12px", fontWeight: "bold", cursor: "pointer"}}
            >{p.cta} →</button>
          </div>
        ))}
      </div>
    </div>
  );
}

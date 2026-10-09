import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

type Category = "Debt" | "Equity" | "Social";
type Filter = "All" | Category;
type Calculator = {
  name: string;
  shortName: string;
  category: Category;
  description: string;
  active: boolean;
  href?: string;
  icon: "sukuk" | "murabaha" | "musharaka" | "mudaraba" | "ijara" | "istisna" | "zakat" | "mortgage" | "takaful";
};

const calculators: Calculator[] = [
  { name: "Sukuk vs Bond", shortName: "Sukuk vs Bond", category: "Debt", description: "Compare pricing, yields, and cash flows for conventional bonds and Ijara sukuk.", active: true, icon: "sukuk" },
  { name: "Murabaha", shortName: "Murabaha", category: "Debt", description: "Explore cost-plus sale pricing and payment schedules.", active: true, href: "/calculators/murabaha", icon: "murabaha" },
  { name: "Musharaka", shortName: "Musharaka", category: "Equity", description: "Model shared ownership and profit allocation.", active: true, href: "/calculators/musharaka", icon: "musharaka" },
  { name: "Mudaraba", shortName: "Mudaraba", category: "Equity", description: "Illustrate investment partnership profit-sharing.", active: false, icon: "mudaraba" },
  { name: "Ijara", shortName: "Ijara", category: "Debt", description: "Estimate lease rentals and review an Ijara payment schedule.", active: true, href: "/calculators/ijara", icon: "ijara" },
  { name: "Istisna", shortName: "Istisna", category: "Debt", description: "Plan staged payments for an asset commissioned for construction.", active: false, icon: "istisna" },
  { name: "Zakat", shortName: "Zakat", category: "Social", description: "Organize eligible assets for an educational zakat estimate.", active: true, href: "/calculators/zakat", icon: "zakat" },
  { name: "Halal Mortgage", shortName: "Islamic Mortgage", category: "Debt", description: "Compare illustrative Murabaha, Ijara, and Diminishing Musharakah payments.", active: true, href: "/calculators/islamic-mortgage", icon: "mortgage" },
  { name: "Takaful", shortName: "Takaful", category: "Social", description: "Estimate cooperative protection contributions, Tabarru, and illustrative surplus.", active: true, href: "/calculators/takaful", icon: "takaful" },
];

const filters: Filter[] = ["All", "Debt", "Equity", "Social"];

function CalculatorIcon({ name }: { name: Calculator["icon"] }) {
  const paths: Record<Calculator["icon"], ReactNode> = {
    sukuk: <><path d="M4 18h16M6 15V9m4 6V5m4 10v-4m4 4V7" /><path d="m4 7 5-3 5 2 6-3" /></>,
    murabaha: <><path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h4" /><path d="m16 15 2 2 3-4" /></>,
    musharaka: <><circle cx="8" cy="8" r="3" /><circle cx="16" cy="8" r="3" /><path d="M3 20v-2a5 5 0 0 1 10 0v2m-2 0v-2a5 5 0 0 1 10 0v2" /></>,
    mudaraba: <><circle cx="12" cy="12" r="9" /><path d="M7 14c1.3 2 3 3 5 3s3.7-1 5-3M8 9h.01M16 9h.01" /></>,
    ijara: <><path d="M3 20h18M5 20V9l7-5 7 5v11M9 20v-7h6v7" /><path d="M9 9h.01M15 9h.01" /></>,
    istisna: <><path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-7h6v7" /><path d="M12 3v5m-2.5-2.5h5" /></>,
    zakat: <><path d="M12 3v18M5 7h14M7 7l-4 8h8L7 7Zm10 0-4 8h8l-4-8ZM7 19h10" /></>,
    mortgage: <><path d="m3 11 9-8 9 8M5 10v10h14V10M9 20v-6h6v6" /><path d="M16 5h3v3" /></>,
    takaful: <><path d="M12 21s-8-4.5-8-11V5l8-3 8 3v5c0 6.5-8 11-8 11Z" /><path d="m8 12 2.5 2.5L16 9" /></>,
  };

  return (
    <svg className="calculator-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

export default function Calculators() {
  const [filter, setFilter] = useState<Filter>("All");
  const [search, setSearch] = useState("");
  const filteredCalculators = useMemo(() => {
    const query = search.trim().toLowerCase();
    return calculators.filter((calculator) => {
      const matchesCategory = filter === "All" || calculator.category === filter;
      const matchesSearch =
        !query ||
        calculator.name.toLowerCase().includes(query) ||
        calculator.description.toLowerCase().includes(query) ||
        calculator.category.toLowerCase().includes(query);
      return matchesCategory && matchesSearch;
    });
  }, [filter, search]);

  return (
    <div className="standard-page marketplace-page">
      <div className="page-heading">
        <p className="eyebrow">NOORFINANCE TOOLS</p>
        <h1>Explore the calculators.</h1>
        <p>Choose a finance structure to explore. More tools are on the way.</p>
      </div>
      <div className="marketplace-controls">
        <div style={{maxWidth: "400px", position: "relative", margin: "20px 0"}}>
          <span style={{position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#888"}} aria-hidden="true">🔍</span>
          <input
            type="text"
            style={{width: "100%", padding: "12px 12px 12px 40px", border: "1px solid #ddd", borderRadius: "8px", fontSize: "14px", outline: "none"}}
            className="search-input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search calculators"
            aria-label="Search calculators"
          />
        </div>
        <div className="calculator-filters" role="group" aria-label="Filter calculators by category">
          {filters.map((item) => (
            <button
              className={filter === item ? "filter-button selected" : "filter-button"}
              type="button"
              key={item}
              aria-pressed={filter === item}
              onClick={() => setFilter(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
      <div className="calculator-grid">
        {filteredCalculators.map((calculator) => (
          <article className={`catalog-card${calculator.active ? " catalog-active" : ""}`} key={calculator.name}>
            <div className="catalog-card-top">
              <span className="catalog-icon-wrap"><CalculatorIcon name={calculator.icon} /></span>
              <span className={`catalog-badge${calculator.active ? " active-badge" : ""}`}>
                {calculator.active ? "Active" : "Coming Soon"}
              </span>
            </div>
            <p className="catalog-category">{calculator.category}</p>
            <h2>{calculator.shortName}</h2>
            <p className="catalog-description">{calculator.description}</p>
            {calculator.active ? (
              <Link
                className="catalog-button catalog-button-active"
                to={calculator.href ?? "/calculators/bond-sukuk"}
              >
                Try Now <span aria-hidden="true">→</span>
              </Link>
            ) : (
              <button className="catalog-button catalog-button-disabled" type="button" disabled>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="5" y="10" width="14" height="11" rx="2" />
                  <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3" />
                </svg>
                Coming Soon
              </button>
            )}
          </article>
        ))}
        {filteredCalculators.length === 0 ? (
          <p className="no-calculators">No calculators match that search. Try another term or category.</p>
        ) : null}
      </div>
      <p className="marketplace-count" aria-live="polite">
        Showing {filteredCalculators.length} of {calculators.length} calculators
      </p>
    </div>
  );
}

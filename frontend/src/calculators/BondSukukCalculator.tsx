import { FormEvent, useEffect, useMemo, useState } from "react";
import Plot from "react-plotly.js";
import "../App.css";
import { saveCalculation } from "./history";
import SaveCalculationButton from "../components/SaveCalculationButton";

type Kind = "bond" | "sukuk";

type Cashflow = {
  period: number;
  time_years: number;
  coupon_or_rental: number;
  principal: number;
  cashflow: number;
  df: number;
  pv: number;
};

type CurvePoint = { yield: number; price: number };

type MonthlyCashflow = {
  date: Date;
  rental: number;
  principal: number;
  total: number;
  balance: number;
};

type PriceResult = {
  instrument: string;
  price: number;
  premium_discount: number;
  quote_vs_par: string;
  macaulay_duration: number;
  modified_duration: number;
  convexity: number;
  dv01: number;
  closed_form: {
    periodic_payment: number;
    a_angle_n: number;
    s_angle_n: number;
    v_n: number;
    pv_coupons_or_rentals: number;
    pv_principal: number;
    price: number;
  };
  cashflows: Cashflow[];
  price_yield_curve: CurvePoint[];
  structure?: {
    type: string;
    rental: string;
    maturity: string;
    note: string;
  };
};

type Comparison = {
  bond: PriceResult;
  sukuk: PriceResult;
  monthlyCashflows: MonthlyCashflow[];
  bondTotalPaid: number;
  sukukTotalPaid: number;
  bondIncome: number;
  sukukIncome: number;
  yieldRate: number;
};

const fmt = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt4 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const fmtPct = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateFmt = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "2-digit" });

function buildMonthlyCashflows(face: number, coupon: number, years: number): MonthlyCashflow[] {
  const start = new Date();
  const maturityMonth = Math.round(years * 12);
  let balance = face;

  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const date = new Date(start.getFullYear(), start.getMonth() + month, 1);
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    date.setDate(Math.min(start.getDate(), lastDay));
    const active = month <= maturityMonth;
    const rental = active ? (face * coupon) / 100 / 12 : 0;
    const principal = month === maturityMonth ? face : 0;
    balance = Math.max(0, balance - principal);

    return { date, rental, principal, total: rental + principal, balance };
  });
}

export default function App() {
  const [kind, setKind] = useState<Kind>("bond");
  const [face, setFace] = useState("1000");
  const [coupon, setCoupon] = useState("6");
  const [yieldRate, setYieldRate] = useState("5");
  const [years, setYears] = useState("10");
  const [freq, setFreq] = useState("2");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PriceResult | null>(null);
  const [cashflows, setCashflows] = useState<MonthlyCashflow[]>([]);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [pricedKind, setPricedKind] = useState<Kind>("bond");
  const [curveHint, setCurveHint] = useState<string>("");

  useEffect(() => {
    fetch("/api/yield-curve")
      .then((r) => r.json())
      .then((d) => {
        const ten = Number(years);
        const nearest = [...d.points].sort(
          (a: { tenor_years: number }, b: { tenor_years: number }) =>
            Math.abs(a.tenor_years - ten) - Math.abs(b.tenor_years - ten)
        )[0];
        if (nearest) {
          setCurveHint(`${nearest.label} par yield ${(nearest.yield * 100).toFixed(2)}%`);
        }
      })
      .catch(() => setCurveHint(""));
  }, [years]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const body = {
      face: Number(face),
      coupon: Number(coupon),
      yield: Number(yieldRate),
      years: Number(years),
      freq: Number(freq),
    };
    try {
      const requestPrice = async (endpoint: string): Promise<PriceResult> => {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || `HTTP ${response.status}`);
        }
        return (await response.json()) as PriceResult;
      };
      const [bond, sukuk] = await Promise.all([
        requestPrice("/api/price/bond"),
        requestPrice("/api/price/sukuk"),
      ]);
      const monthlyCashflows = buildMonthlyCashflows(body.face, body.coupon, body.years);
      setResult(kind === "bond" ? bond : sukuk);
      setPricedKind(kind);
      setCashflows(monthlyCashflows);
      setComparison({
        bond,
        sukuk,
        monthlyCashflows,
        bondTotalPaid: bond.cashflows.reduce((total, cashflow) => total + cashflow.cashflow, 0),
        sukukTotalPaid: sukuk.cashflows.reduce((total, cashflow) => total + cashflow.cashflow, 0),
        bondIncome: bond.cashflows.reduce((total, cashflow) => total + cashflow.coupon_or_rental, 0),
        sukukIncome: sukuk.cashflows.reduce((total, cashflow) => total + cashflow.coupon_or_rental, 0),
        yieldRate: body.yield,
      });
      try {
        saveCalculation({
          id: crypto.randomUUID(),
          date: new Date().toISOString(),
          instrument: kind === "bond" ? "Bond" : "Ijara Sukuk",
          face: body.face,
          coupon: body.coupon,
          yieldRate: body.yield,
          years: body.years,
          frequency: body.freq,
          price: (kind === "bond" ? bond : sukuk).price,
        });
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "browser storage is unavailable";
        setError(`Pricing succeeded, but calculation history could not be saved: ${message}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pricing failed");
    } finally {
      setLoading(false);
    }
  }

  const plotData = useMemo(() => {
    if (!result) return [];
    const y = result.price_yield_curve.map((p) => p.yield * 100);
    const p = result.price_yield_curve.map((p) => p.price);
    const rawY = Number(yieldRate);
    const markYieldPct = rawY > 1.5 ? rawY : rawY * 100;
    return [
      {
        x: y,
        y: p,
        type: "scatter" as const,
        mode: "lines" as const,
        name: "Price",
        line: { color: "#1A3D2E", width: 3 },
        fill: "tozeroy" as const,
        fillcolor: "rgba(26, 61, 46, 0.08)",
      },
      {
        x: [markYieldPct],
        y: [result.price],
        type: "scatter" as const,
        mode: "markers" as const,
        name: "Quoted",
        marker: { size: 12, color: "#c45c26", symbol: "diamond" },
      },
    ];
  }, [result, yieldRate]);

  function exportCashflows() {
    const rows = [
      ["Date", "Rental", "Principal", "Total", "Balance"],
      ...cashflows.map(({ date, rental, principal, total, balance }) => [
        `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
        rental.toFixed(2),
        principal.toFixed(2),
        total.toFixed(2),
        balance.toFixed(2),
      ]),
    ];
    const csv = rows.map((row) => row.join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "bond-sukuk-cashflows.csv";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const monthlyMax = comparison
    ? Math.max(...comparison.monthlyCashflows.map((cashflow) => cashflow.rental), 0)
    : 0;
  const higherReturn = comparison
    ? comparison.bondIncome > comparison.sukukIncome
      ? "Bond"
      : comparison.sukukIncome > comparison.bondIncome
        ? "Sukuk"
        : "Tie"
    : null;

  return (
    <div className="app-shell">
      <header className="stage">
        <p className="brand">NoorFinance</p>
        <h1>Price the cash flows. Read the curve.</h1>
        <p className="lede">
          Closed-form a-angle-n pricing for coupon bonds and Ijara sukuk — rentals plus face at maturity.
        </p>
      </header>

      <div className="board">
        <form className="panel inputs" onSubmit={onSubmit}>
          <div className="kind">
            <button type="button" className={kind === "bond" ? "on" : ""} onClick={() => setKind("bond")}>
              Bond
            </button>
            <button type="button" className={kind === "sukuk" ? "on" : ""} onClick={() => setKind("sukuk")}>
              Ijara Sukuk
            </button>
          </div>

          <label>
            Face value
            <input value={face} onChange={(e) => setFace(e.target.value)} type="number" min={1} step="1" required />
          </label>
          <label>
            {kind === "sukuk" ? "Rental rate % p.a." : "Coupon % p.a."}
            <input value={coupon} onChange={(e) => setCoupon(e.target.value)} type="number" min={0} step="0.01" required />
          </label>
          <label>
            Yield % p.a.
            <input value={yieldRate} onChange={(e) => setYieldRate(e.target.value)} type="number" min={0} step="0.01" required />
          </label>
          <label>
            Years
            <input value={years} onChange={(e) => setYears(e.target.value)} type="number" min={0.5} step="0.5" required />
          </label>
          <label>
            Frequency
            <select value={freq} onChange={(e) => setFreq(e.target.value)}>
              <option value="1">Annual</option>
              <option value="2">Semiannual</option>
              <option value="4">Quarterly</option>
              <option value="12">Monthly</option>
            </select>
          </label>

          {curveHint ? <p className="hint">Benchmark {curveHint}</p> : null}

          <button className="go" type="submit" disabled={loading}>
            {loading ? "Pricing…" : "Price instrument"}
          </button>
          {error ? <p className="err">{error}</p> : null}
        </form>

        <section className="panel result">
          {!result ? (
            <p className="empty">Enter terms and price. Present value is Σ CFₜ / (1+i)ᵗ.</p>
          ) : (
            <>
              <p className="kicker">{result.instrument.replace("_", " ")}</p>
              <span className={`instrument-badge ${pricedKind === "sukuk" ? "badge-ijara" : "badge-conventional"}`}>
                {pricedKind === "sukuk" ? "Ijara" : "Conventional"}
              </span>
              <p className="price">{fmt.format(result.price)}</p>
              <p className="vspar">
                {result.quote_vs_par} · {result.premium_discount >= 0 ? "+" : ""}
                {fmt.format(result.premium_discount)} vs par
              </p>
              {result.structure ? <p className="note">{result.structure.note}</p> : null}
              <dl>
                <div>
                  <dt>a-angle-n</dt>
                  <dd>{fmt4.format(result.closed_form.a_angle_n)}</dd>
                </div>
                <div>
                  <dt>s-angle-n</dt>
                  <dd>{fmt4.format(result.closed_form.s_angle_n)}</dd>
                </div>
                <div>
                  <dt>vⁿ</dt>
                  <dd>{fmt4.format(result.closed_form.v_n)}</dd>
                </div>
                <div>
                  <dt>{kind === "sukuk" ? "PV rentals" : "PV coupons"}</dt>
                  <dd>{fmt.format(result.closed_form.pv_coupons_or_rentals)}</dd>
                </div>
                <div>
                  <dt>PV face</dt>
                  <dd>{fmt.format(result.closed_form.pv_principal)}</dd>
                </div>
                <div>
                  <dt>Macaulay</dt>
                  <dd>{fmt4.format(result.macaulay_duration)} y</dd>
                </div>
                <div>
                  <dt>Modified</dt>
                  <dd>{fmt4.format(result.modified_duration)}</dd>
                </div>
                <div>
                  <dt>Convexity</dt>
                  <dd>{fmt4.format(result.convexity)}</dd>
                </div>
                <div>
                  <dt>DV01</dt>
                  <dd>{fmt4.format(result.dv01)}</dd>
                </div>
              </dl>
            </>
          )}
        </section>

        <section className="panel chart">
          {result ? (
            <Plot
              data={plotData}
              layout={{
                title: { text: "Price versus yield", font: { family: "Syne, sans-serif", size: 16, color: "#163028" } },
                paper_bgcolor: "rgba(0,0,0,0)",
                plot_bgcolor: "rgba(247, 243, 232, 0.35)",
                margin: { l: 52, r: 18, t: 48, b: 48 },
                xaxis: { title: { text: "Yield %" }, gridcolor: "rgba(22,48,40,0.12)", zeroline: false },
                yaxis: { title: { text: "Price" }, gridcolor: "rgba(22,48,40,0.12)", zeroline: false },
                font: { family: "Source Sans 3, sans-serif", color: "#163028" },
                showlegend: false,
                hovermode: "closest",
              }}
              config={{ displayModeBar: false, responsive: true }}
              style={{ width: "100%", height: "100%" }}
              useResizeHandler
            />
          ) : (
            <div className="chart-wait">Price a bond or sukuk to draw the price–yield curve.</div>
          )}
        </section>
      </div>
      {comparison ? (
        <section className="comparison-section" aria-labelledby="comparison-title">
          <h2 id="comparison-title" className="section-title">Bond vs Sukuk comparison</h2>
          <div className="summary-cards">
            <article className="panel summary-card">
              <h3>Total Paid</h3>
              <div><span>Bond</span><strong>{fmt.format(comparison.bondTotalPaid)}</strong></div>
              <div><span>Sukuk</span><strong>{fmt.format(comparison.sukukTotalPaid)}</strong></div>
            </article>
            <article className="panel summary-card">
              <h3>Total Rental / Profit</h3>
              <div><span>Bond</span><strong>{fmt.format(comparison.bondIncome)}</strong></div>
              <div><span>Sukuk</span><strong>{fmt.format(comparison.sukukIncome)}</strong></div>
            </article>
            <article className="panel summary-card">
              <h3>Yield</h3>
              <div><span>Bond</span><strong>{fmtPct.format(comparison.yieldRate)}%</strong></div>
              <div><span>Sukuk</span><strong>{fmtPct.format(comparison.yieldRate)}%</strong></div>
            </article>
          </div>
          <div className="comparison-columns">
            <article className="panel comparison-card">
              <div className="comparison-card-heading">
                <h3>Bond</h3>
                <span className="instrument-badge badge-conventional">Conventional</span>
              </div>
              <p className="comparison-price">{fmt.format(comparison.bond.price)}</p>
              <p className="comparison-caption">Calculated price</p>
              <dl>
                <div><dt>Rental / profit PV</dt><dd>{fmt.format(comparison.bond.closed_form.pv_coupons_or_rentals)}</dd></div>
                <div><dt>Yield</dt><dd>{fmtPct.format(comparison.yieldRate)}%</dd></div>
              </dl>
            </article>
            <article className="panel comparison-card">
              <div className="comparison-card-heading">
                <h3>Ijara Sukuk</h3>
                <span className="instrument-badge badge-ijara">Ijara</span>
              </div>
              <p className="comparison-price">{fmt.format(comparison.sukuk.price)}</p>
              <p className="comparison-caption">Calculated price</p>
              <dl>
                <div><dt>Rental / profit PV</dt><dd>{fmt.format(comparison.sukuk.closed_form.pv_coupons_or_rentals)}</dd></div>
                <div><dt>Yield</dt><dd>{fmtPct.format(comparison.yieldRate)}%</dd></div>
              </dl>
            </article>
          </div>
          <p className="comparison-outcome" role="status">
            {higherReturn === "Tie"
              ? "Higher return: Tie — with the same terms, bond coupons and Ijara rentals produce equivalent cash flows."
              : `Higher return: ${higherReturn}`}
          </p>
          <section className="panel monthly-chart" aria-labelledby="monthly-chart-title">
            <h3 id="monthly-chart-title">12-month rental / profit</h3>
            <div className="bar-chart">
              {comparison.monthlyCashflows.map(({ date, rental }) => {
                const barHeight = monthlyMax > 0 ? (rental / monthlyMax) * 100 : 0;
                return (
                  <div className="bar-month" key={date.toISOString()}>
                    <div className="bar-pair">
                      <div
                        className="bar bar-bond"
                        style={{ height: `${barHeight}%` }}
                        role="img"
                        aria-label={`Bond ${dateFmt.format(date)} rental ${fmt.format(rental)}`}
                        title={`Bond: ${fmt.format(rental)}`}
                      />
                      <div
                        className="bar bar-sukuk"
                        style={{ height: `${barHeight}%` }}
                        role="img"
                        aria-label={`Sukuk ${dateFmt.format(date)} rental ${fmt.format(rental)}`}
                        title={`Sukuk: ${fmt.format(rental)}`}
                      />
                    </div>
                    <span>{date.toLocaleDateString("en-US", { month: "short" })}</span>
                  </div>
                );
              })}
            </div>
            <div className="chart-legend">
              <span><i className="legend-bond" /> Bond</span>
              <span><i className="legend-sukuk" /> Sukuk</span>
            </div>
          </section>
        </section>
      ) : null}
      {result ? (
        <section className="panel cashflow-section" id="cashflow-section">
          <div className="cashflow-heading">
            <h2>12-month cash flows</h2>
            <div className="cashflow-actions">
              <button className="export-button" type="button" onClick={exportCashflows}>
                Export CSV
              </button>
              <button className="export-button print-button" type="button" onClick={() => window.print()}>
                Print / PDF
              </button>
            </div>
          </div>
          <div className="cashflow-scroll">
            <table className="cashflow-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Rental</th>
                  <th>Principal</th>
                  <th>Total</th>
                  <th>Balance</th>
                </tr>
              </thead>
              <tbody>
                {cashflows.map((cashflow) => (
                  <tr key={cashflow.date.toISOString()}>
                    <td>{dateFmt.format(cashflow.date)}</td>
                    <td>{fmt.format(cashflow.rental)}</td>
                    <td>{fmt.format(cashflow.principal)}</td>
                    <td>{fmt.format(cashflow.total)}</td>
                    <td>{fmt.format(cashflow.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
      <SaveCalculationButton
        calculatorType="Bond & Sukuk"
        disabled={!result || !comparison}
        inputs={{
          instrument: pricedKind,
          face: Number(face),
          coupon: Number(coupon),
          yield: Number(yieldRate),
          years: Number(years),
          frequency: Number(freq),
        }}
        results={{
          pricedInstrument: result?.instrument ?? null,
          price: result?.price ?? null,
          bondPrice: comparison?.bond.price ?? null,
          sukukPrice: comparison?.sukuk.price ?? null,
          bondTotalPaid: comparison?.bondTotalPaid ?? null,
          sukukTotalPaid: comparison?.sukukTotalPaid ?? null,
          bondRentalOrProfit: comparison?.bondIncome ?? null,
          sukukRentalOrProfit: comparison?.sukukIncome ?? null,
          yield: comparison?.yieldRate ?? null,
          cashflows: cashflows.map(({ date, rental, principal, total, balance }) => ({
            date: date.toISOString(),
            rental,
            principal,
            total,
            balance,
          })),
        }}
      />
    </div>
  );
}

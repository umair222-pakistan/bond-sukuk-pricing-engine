import { FormEvent, useEffect, useMemo, useState } from "react";
import Plot from "react-plotly.js";
import "./App.css";

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

const fmt = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt4 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 });

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
      const res = await fetch(kind === "bond" ? "/api/price/bond" : "/api/price/sukuk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as PriceResult;
      setResult(data);
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
        line: { color: "#1f4d3a", width: 3 },
        fill: "tozeroy" as const,
        fillcolor: "rgba(31, 77, 58, 0.08)",
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

  return (
    <div className="stage">
      <header className="mast">
        <p className="brand">Mithaq</p>
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
    </div>
  );
}

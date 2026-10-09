import { useMemo, useState, type FormEvent } from "react";
import { saveCalculation } from "./history";
import SaveCalculationButton from "../components/SaveCalculationButton";

type Inputs = {
  totalProjectCost: string;
  bankContributionPercent: string;
  customerContributionPercent: string;
  expectedAnnualProfitPercent: string;
  bankProfitSharePercent: string;
  customerProfitSharePercent: string;
  tenureYears: string;
};

type OwnershipYear = {
  year: number;
  bankOwnership: number;
  customerOwnership: number;
  buyoutThisYear: number;
  cumulativeBuyout: number;
};

const money = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const percent = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const initialInputs: Inputs = {
  totalProjectCost: "500000",
  bankContributionPercent: "80",
  customerContributionPercent: "20",
  expectedAnnualProfitPercent: "10",
  bankProfitSharePercent: "60",
  customerProfitSharePercent: "40",
  tenureYears: "20",
};

function polarPoint(cx: number, cy: number, radius: number, angle: number): [number, number] {
  const radians = (angle - 90) * Math.PI / 180;
  return [cx + radius * Math.cos(radians), cy + radius * Math.sin(radians)];
}

function pieSlicePath(cx: number, cy: number, radius: number, startAngle: number, endAngle: number): string {
  if (endAngle - startAngle >= 360) {
    return `M ${cx} ${cy - radius} A ${radius} ${radius} 0 1 1 ${cx} ${cy + radius} A ${radius} ${radius} 0 1 1 ${cx} ${cy - radius} Z`;
  }
  const [startX, startY] = polarPoint(cx, cy, radius, startAngle);
  const [endX, endY] = polarPoint(cx, cy, radius, endAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${startX} ${startY} A ${radius} ${radius} 0 ${largeArc} 1 ${endX} ${endY} Z`;
}

function buildOwnershipYears(bankInvestment: number, projectCost: number, tenure: number): OwnershipYear[] {
  const annualBuyout = bankInvestment / tenure;
  return Array.from({ length: tenure }, (_, index) => {
    const year = index + 1;
    const cumulativeBuyout = Math.min(bankInvestment, annualBuyout * year);
    const bankRemaining = Math.max(0, bankInvestment - cumulativeBuyout);
    return {
      year,
      bankOwnership: projectCost > 0 ? (bankRemaining / projectCost) * 100 : 0,
      customerOwnership: projectCost > 0 ? (1 - bankRemaining / projectCost) * 100 : 0,
      buyoutThisYear: Math.min(annualBuyout, bankInvestment - annualBuyout * (year - 1)),
      cumulativeBuyout,
    };
  });
}

export default function MusharakaCalculator() {
  const [inputs, setInputs] = useState<Inputs>(initialInputs);
  const [error, setError] = useState<string | null>(null);
  const projectCost = Number(inputs.totalProjectCost);
  const bankContributionPercent = Number(inputs.bankContributionPercent);
  const customerContribution = Number(inputs.customerContributionPercent);
  const annualProfitPercent = Number(inputs.expectedAnnualProfitPercent);
  const bankSharingPercent = Number(inputs.bankProfitSharePercent);
  const customerSharingPercent = Number(inputs.customerProfitSharePercent);
  const tenure = Number(inputs.tenureYears);

  const bankInvestment = projectCost * bankContributionPercent / 100;
  const customerInvestment = projectCost - bankInvestment;
  const annualProfit = projectCost * annualProfitPercent / 100;
  const bankProfit = annualProfit * bankSharingPercent / 100;
  const customerProfit = annualProfit - bankProfit;
  const monthlyBuyout = tenure > 0 ? bankInvestment / (tenure * 12) : 0;
  const bankRoe = bankInvestment > 0 ? bankProfit / bankInvestment * 100 : 0;
  const customerRoe = customerInvestment > 0 ? customerProfit / customerInvestment * 100 : 0;
  const valid =
    Number.isFinite(projectCost) &&
    projectCost > 0 &&
    Number.isFinite(bankContributionPercent) &&
    bankContributionPercent >= 0 &&
    bankContributionPercent <= 100 &&
    Number.isFinite(customerContribution) &&
    customerContribution >= 0 &&
    customerContribution <= 100 &&
    Math.abs(bankContributionPercent + customerContribution - 100) < 0.000001 &&
    Number.isFinite(annualProfitPercent) &&
    annualProfitPercent >= 0 &&
    Number.isFinite(bankSharingPercent) &&
    bankSharingPercent >= 0 &&
    bankSharingPercent <= 100 &&
    Number.isFinite(customerSharingPercent) &&
    customerSharingPercent >= 0 &&
    customerSharingPercent <= 100 &&
    Math.abs(bankSharingPercent + customerSharingPercent - 100) < 0.000001 &&
    Number.isInteger(tenure) &&
    tenure >= 1 &&
    tenure <= 50;

  const years = useMemo(
    () => valid ? buildOwnershipYears(bankInvestment, projectCost, tenure) : [],
    [bankInvestment, projectCost, tenure, valid],
  );

  function update(key: keyof Inputs, value: string) {
    setInputs((previous) => ({ ...previous, [key]: value }));
    setError(null);
  }

  function saveResult(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!valid) {
      setError("Bank and customer contributions must total 100%, and tenure must be 1–50 whole years.");
      return;
    }
    try {
      saveCalculation({
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
        instrument: "Musharaka",
        face: projectCost,
        coupon: annualProfitPercent,
        yieldRate: bankSharingPercent,
        years: tenure,
        frequency: 1,
        price: annualProfit,
      });
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "browser storage is unavailable";
      setError(`Calculation completed, but could not be saved to local history: ${reason}`);
    }
  }

  const equitySeries = [bankContributionPercent, ...years.map((year) => year.bankOwnership)];
  const chartWidth = 720;
  const chartHeight = 250;
  const chartLeft = 46;
  const chartRight = 12;
  const chartTop = 16;
  const chartBottom = 204;
  const plotWidth = chartWidth - chartLeft - chartRight;
  const plotHeight = chartBottom - chartTop;
  const linePoints = equitySeries.map((bankPercentValue, index) => {
    const x = chartLeft + (equitySeries.length > 1 ? index / (equitySeries.length - 1) : 0) * plotWidth;
    const y = chartTop + (1 - bankPercentValue / 100) * plotHeight;
    return `${x},${y}`;
  });
  const equityTransferPath = `M ${linePoints.join(" L ")}`;
  const bankPieEnd = 360 * bankContributionPercent / 100;

  return (
    <div className="musharaka-calculator">
      <form className="panel inputs musharaka-inputs" onSubmit={saveResult}>
        <label>
          Total Project Cost
          <input type="number" min="0.01" step="0.01" required value={inputs.totalProjectCost} onChange={(event) => update("totalProjectCost", event.target.value)} />
        </label>
        <label>
          Bank Contribution %
          <input type="number" min="0" max="100" step="0.01" required value={inputs.bankContributionPercent} onChange={(event) => update("bankContributionPercent", event.target.value)} />
        </label>
        <label>
          Customer Contribution %
          <input type="number" min="0" max="100" step="0.01" required value={inputs.customerContributionPercent} onChange={(event) => update("customerContributionPercent", event.target.value)} />
        </label>
        <label>
          Expected Annual Profit %
          <input type="number" min="0" step="0.01" required value={inputs.expectedAnnualProfitPercent} onChange={(event) => update("expectedAnnualProfitPercent", event.target.value)} />
        </label>
        <label>
          Profit Sharing Ratio Bank %
          <input type="number" min="0" max="100" step="0.01" required value={inputs.bankProfitSharePercent} onChange={(event) => update("bankProfitSharePercent", event.target.value)} />
        </label>
        <label>
          Profit Sharing Ratio Customer %
          <input type="number" min="0" max="100" step="0.01" required value={inputs.customerProfitSharePercent} onChange={(event) => update("customerProfitSharePercent", event.target.value)} />
        </label>
        <label>
          Tenure years
          <input type="number" min="1" max="50" step="1" required value={inputs.tenureYears} onChange={(event) => update("tenureYears", event.target.value)} />
        </label>
        <button className="go" type="submit" disabled={!valid}>Save Calculation</button>
        {error ? <p className="err" role="alert">{error}</p> : null}
      </form>

      {!valid ? (
        <p className="musharaka-validation" role="alert">
          Bank and customer contribution and profit-sharing ratios must each total 100%. Enter valid non-negative rates and a whole tenure from 1–50 years.
        </p>
      ) : (
        <>
          <section className="musharaka-summary" aria-label="Musharaka calculation summary">
            <article className="panel musharaka-metric"><span>Bank Investment</span><strong>{money.format(bankInvestment)}</strong></article>
            <article className="panel musharaka-metric"><span>Customer Investment</span><strong>{money.format(customerInvestment)}</strong></article>
            <article className="panel musharaka-metric"><span>Total Annual Profit</span><strong>{money.format(annualProfit)}</strong></article>
            <article className="panel musharaka-metric"><span>Bank&apos;s Profit</span><strong>{money.format(bankProfit)}</strong></article>
            <article className="panel musharaka-metric"><span>Customer&apos;s Profit</span><strong>{money.format(customerProfit)}</strong></article>
            <article className="panel musharaka-metric"><span>Monthly Equity Buyout</span><strong>{money.format(monthlyBuyout)}</strong></article>
            <article className="panel musharaka-metric"><span>ROE Bank</span><strong>{percent.format(bankRoe)}%</strong></article>
            <article className="panel musharaka-metric"><span>ROE Customer</span><strong>{percent.format(customerRoe)}%</strong></article>
          </section>

          <section className="musharaka-charts">
            <article className="panel musharaka-chart-card">
              <div className="musharaka-chart-heading">
                <p className="eyebrow">INITIAL CONTRIBUTIONS</p>
                <h2>Ownership split</h2>
              </div>
              <div className="ownership-pie-wrap">
                <svg className="ownership-pie" viewBox="0 0 220 220" role="img" aria-label={`Initial ownership: Bank ${percent.format(bankContributionPercent)}%, Customer ${percent.format(customerContribution)}%`}>
                  <path d={pieSlicePath(110, 110, 94, 0, bankPieEnd)} className="ownership-bank" />
                  <path d={pieSlicePath(110, 110, 94, bankPieEnd, 360)} className="ownership-customer" />
                  <circle cx="110" cy="110" r="57" className="ownership-pie-hole" />
                  <text x="110" y="105" className="ownership-pie-title">OWNERSHIP</text>
                  <text x="110" y="127" className="ownership-pie-subtitle">at start</text>
                </svg>
              </div>
              <div className="ownership-legend">
                <span><i className="ownership-bank-dot" />Bank {percent.format(bankContributionPercent)}%</span>
                <span><i className="ownership-customer-dot" />Customer {percent.format(customerContribution)}%</span>
              </div>
            </article>

            <article className="panel musharaka-chart-card">
              <div className="musharaka-chart-heading">
                <p className="eyebrow">DIMINISHING OWNERSHIP</p>
                <h2>Bank share transferred over time</h2>
              </div>
              <div className="ownership-line-wrap">
                <svg className="ownership-line-chart" viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-label={`Bank ownership declines from ${percent.format(bankContributionPercent)}% to 0% over ${tenure} years`}>
                  {[0, 25, 50, 75, 100].map((tick) => {
                    const y = chartTop + (1 - tick / 100) * plotHeight;
                    return (
                      <g key={tick}>
                        <line x1={chartLeft} y1={y} x2={chartWidth - chartRight} y2={y} className="ownership-grid-line" />
                        <text x={chartLeft - 8} y={y + 4} textAnchor="end" className="ownership-axis-label">{tick}%</text>
                      </g>
                    );
                  })}
                  <path d={equityTransferPath} className="ownership-equity-area" />
                  <path d={equityTransferPath} className="ownership-equity-line" />
                  <text x={chartLeft} y={chartHeight - 12} className="ownership-axis-label">Year 0</text>
                  <text x={chartWidth - chartRight} y={chartHeight - 12} textAnchor="end" className="ownership-axis-label">Year {tenure}</text>
                </svg>
              </div>
              <div className="ownership-line-legend"><i />Bank ownership share</div>
            </article>
          </section>

          <section className="panel musharaka-table-section">
            <div className="musharaka-chart-heading">
              <p className="eyebrow">DIMINISHING MUSHARAKA SCHEDULE</p>
              <h2>Year-by-year ownership shift</h2>
            </div>
            <div className="cashflow-scroll musharaka-table-scroll">
              <table className="cashflow-table">
                <thead>
                  <tr><th>Year</th><th>Buyout this year</th><th>Cumulative buyout</th><th>Bank ownership</th><th>Customer ownership</th></tr>
                </thead>
                <tbody>
                  {years.map((year) => (
                    <tr key={year.year}>
                      <td>{year.year}</td>
                      <td>{money.format(year.buyoutThisYear)}</td>
                      <td>{money.format(year.cumulativeBuyout)}</td>
                      <td>{percent.format(year.bankOwnership)}%</td>
                      <td>{percent.format(year.customerOwnership)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <p className="musharaka-note">
            Musharaka: Joint venture, profit shared by agreement, loss by capital ratio - AAOIFI Shariah Standard
          </p>
          <p className="musharaka-disclaimer">
            Illustrative estimate only. Actual profit, ownership transfer, and loss allocation depend on the agreed contract.
          </p>
        </>
      )}
      <SaveCalculationButton
        calculatorType="Musharaka"
        disabled={!valid}
        inputs={{
          totalProjectCost: projectCost,
          bankContributionPercent,
          customerContributionPercent: customerContribution,
          expectedAnnualProfitPercent: annualProfitPercent,
          bankProfitSharePercent: bankSharingPercent,
          customerProfitSharePercent: customerSharingPercent,
          tenureYears: tenure,
        }}
        results={{
          bankInvestment,
          customerInvestment,
          annualProfit,
          bankProfit,
          customerProfit,
          monthlyBuyout,
          bankRoe,
          customerRoe,
        }}
      />
    </div>
  );
}

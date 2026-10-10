import { useMemo, useState, type FormEvent } from "react";
import { saveCalculation } from "./history";
import SaveCalculationButton from "../components/SaveCalculationButton";
import { useLicense } from "../hooks/useLicense";

type Inputs = {
  propertyPrice: string;
  downPaymentPercent: string;
  ijaraRate: string;
  leaseTermYears: string;
  residualValuePercent: string;
};

type PaymentRow = {
  month: number;
  year: number;
  monthlyPayment: number;
  rent: number;
  equity: number;
  cumulativeEquity: number;
  remainingFinanced: number;
  cumulativeRent: number;
};

const money = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const initialInputs: Inputs = {
  propertyPrice: "300000",
  downPaymentPercent: "20",
  ijaraRate: "5",
  leaseTermYears: "25",
  residualValuePercent: "0",
};

function buildPaymentRows(financed: number, ratePercent: number, termYears: number): PaymentRow[] {
  const months = termYears * 12;
  const rent = financed * (ratePercent / 100) / 12;
  const equity = financed / months;
  let cumulativeEquity = 0;
  let cumulativeRent = 0;

  return Array.from({ length: months }, (_, index) => {
    const month = index + 1;
    cumulativeEquity += equity;
    cumulativeRent += rent;
    return {
      month,
      year: Math.ceil(month / 12),
      monthlyPayment: rent + equity,
      rent,
      equity,
      cumulativeEquity: Math.min(financed, cumulativeEquity),
      remainingFinanced: Math.max(0, financed - cumulativeEquity),
      cumulativeRent,
    };
  });
}

function buildAreaPath(values: number[], maxValue: number, width: number, top: number, bottom: number): string {
  const step = width / Math.max(values.length - 1, 1);
  const plotHeight = bottom - top;
  const points = values.map((value, index) => {
    const x = index * step;
    const y = bottom - (maxValue > 0 ? value / maxValue : 0) * plotHeight;
    return `${x},${y}`;
  });
  return `M 0,${bottom} L ${points.join(" L ")} L ${width},${bottom} Z`;
}

function buildStackedAreaPath(
  lowerValues: number[],
  upperValues: number[],
  maxValue: number,
  width: number,
  top: number,
  bottom: number,
): string {
  const step = width / Math.max(upperValues.length - 1, 1);
  const plotHeight = bottom - top;
  const upperPoints = upperValues.map((value, index) => {
    const x = index * step;
    const y = bottom - (maxValue > 0 ? value / maxValue : 0) * plotHeight;
    return `${x},${y}`;
  });
  const lowerPoints = lowerValues.map((value, index) => {
    const x = (lowerValues.length - 1 - index) * step;
    const y = bottom - (maxValue > 0 ? value / maxValue : 0) * plotHeight;
    return `${x},${y}`;
  });
  return `M ${upperPoints.join(" L ")} L ${lowerPoints.join(" L ")} Z`;
}

export default function IjaraCalculator() {
  const { consumeFreeCalculation, freeCalculationsUsed, tier } = useLicense();
  const freeLimitReached = tier === "free" && freeCalculationsUsed >= 1;
  const [inputs, setInputs] = useState<Inputs>(initialInputs);
  const [error, setError] = useState<string | null>(null);
  const [hasCalculated, setHasCalculated] = useState(false);
  const propertyPrice = Number(inputs.propertyPrice);
  const downPaymentPercent = Number(inputs.downPaymentPercent);
  const rate = Number(inputs.ijaraRate);
  const termYears = Number(inputs.leaseTermYears);
  const residualPercent = Number(inputs.residualValuePercent);
  const downAmount = propertyPrice * downPaymentPercent / 100;
  const financed = propertyPrice * (1 - downPaymentPercent / 100);
  const monthCount = termYears * 12;
  const monthlyRent = financed * (rate / 100 / 12);
  const monthlyPrincipal = monthCount > 0 ? financed / monthCount : 0;
  const monthlyPayment = monthlyRent + monthlyPrincipal;
  const totalPaid = monthlyPayment * monthCount + downAmount;
  const totalRent = totalPaid - propertyPrice;
  const residualValue = propertyPrice * residualPercent / 100;
  const valid =
    Number.isFinite(propertyPrice) &&
    propertyPrice > 0 &&
    Number.isFinite(downPaymentPercent) &&
    downPaymentPercent >= 0 &&
    downPaymentPercent <= 100 &&
    Number.isFinite(rate) &&
    rate >= 0 &&
    Number.isInteger(termYears) &&
    termYears >= 1 &&
    termYears <= 30 &&
    Number.isFinite(residualPercent) &&
    residualPercent >= 0 &&
    residualPercent <= 100;

  const rows = useMemo(
    () => valid ? buildPaymentRows(financed, rate, termYears) : [],
    [financed, rate, termYears, valid],
  );
  const maxCumulativePaid = totalPaid;
  const rentValues = rows.map((row) => row.cumulativeRent);
  const equityValues = rows.map((row) => row.cumulativeEquity);
  const chartWidth = 720;
  const chartTop = 22;
  const chartBottom = 190;
  const totalValues = rentValues.map((rentValue, index) => rentValue + equityValues[index]);
  const equityPath = buildAreaPath(equityValues, maxCumulativePaid, chartWidth, chartTop, chartBottom);
  const rentPath = buildStackedAreaPath(
    equityValues,
    totalValues,
    maxCumulativePaid,
    chartWidth,
    chartTop,
    chartBottom,
  );

  function update(key: keyof Inputs, value: string) {
    setInputs((current) => ({ ...current, [key]: value }));
    setError(null);
  }

  function saveResult(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!valid) {
      setError("Check the entered values. Term must be 1–30 whole years and percentages must be 0–100.");
      return;
    }
    if (!consumeFreeCalculation()) {
      setError("The free plan includes one calculation. Upgrade to continue.");
      return;
    }
    setHasCalculated(true);
    try {
      saveCalculation({
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
        instrument: "Ijara",
        face: propertyPrice,
        coupon: rate,
        yieldRate: 0,
        years: termYears,
        frequency: 12,
        price: totalPaid,
      });
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "browser storage is unavailable";
      setError(`Calculation completed, but could not be saved to local history: ${reason}`);
    }
  }

  const fields: { key: keyof Inputs; label: string; suffix?: string; min: number; max?: number; step: string }[] = [
    { key: "propertyPrice", label: "Property Price", min: 0.01, step: "0.01" },
    { key: "downPaymentPercent", label: "Down Payment", suffix: "%", min: 0, max: 100, step: "0.01" },
    { key: "ijaraRate", label: "Ijara Rate % annual", min: 0, step: "0.01" },
    { key: "leaseTermYears", label: "Lease Term years", min: 1, max: 30, step: "1" },
    { key: "residualValuePercent", label: "Residual Value", suffix: "%", min: 0, max: 100, step: "0.01" },
  ];

  return (
    <div className="ijara-calculator">
      <form className="panel inputs ijara-inputs" onSubmit={saveResult}>
        {fields.map(({ key, label, suffix, min, max, step }) => (
          <label key={key}>
            {label}
            <span className="ijara-input-wrap">
              <input
                type="number"
                min={min}
                max={max}
                step={step}
                required
                value={inputs[key]}
                disabled={freeLimitReached}
                onChange={(event) => update(key, event.target.value)}
              />
              {suffix ? <span className="ijara-input-suffix">{suffix}</span> : null}
            </span>
          </label>
        ))}
        <button className="go" type="submit" disabled={!valid}>Save Calculation</button>
        {error ? <p className="err" role="alert">{error}</p> : null}
      </form>

      {tier === "free" && !hasCalculated ? (
        <p className="calculator-validation">Submit once to use your free calculation.</p>
      ) : !valid ? (
        <p className="ijara-validation" role="alert">
          Enter a positive property price, percentages from 0–100, and a whole lease term from 1–30 years.
        </p>
      ) : (
        <>
          <section className="ijara-summary" aria-label="Ijara calculation summary">
            <article className="panel ijara-metric">
              <span>Monthly Ijara Payment</span>
              <strong>{money.format(monthlyPayment)}</strong>
            </article>
            <article className="panel ijara-metric">
              <span>Total Paid</span>
              <strong>{money.format(totalPaid)}</strong>
            </article>
            <article className="panel ijara-metric">
              <span>Total Rent / Profit</span>
              <strong>{money.format(totalRent)}</strong>
            </article>
            <article className="panel ijara-metric">
              <span>Down Amount</span>
              <strong>{money.format(downAmount)}</strong>
            </article>
            <article className="panel ijara-metric">
              <span>Financed Amount</span>
              <strong>{money.format(financed)}</strong>
            </article>
            <article className="panel ijara-metric ijara-residual">
              <span>Residual value (informational)</span>
              <strong>{money.format(residualValue)}</strong>
            </article>
          </section>

          <section className="panel ijara-chart-section">
            <div className="ijara-section-heading">
              <div>
                <p className="eyebrow">PAYMENT COMPOSITION</p>
                <h2>Rent and equity over time</h2>
              </div>
              <div className="ijara-chart-legend">
                <span><i className="ijara-legend-rent" /> Rent</span>
                <span><i className="ijara-legend-equity" /> Equity built</span>
              </div>
            </div>
            <div className="ijara-area-chart-wrap">
              <svg
                className="ijara-area-chart"
                viewBox={`0 0 ${chartWidth} ${chartBottom + 18}`}
                role="img"
                aria-label="Stacked area chart showing cumulative rent and equity built over the lease term"
                preserveAspectRatio="none"
              >
                <line x1="0" y1={chartTop} x2={chartWidth} y2={chartTop} className="ijara-grid-line" />
                <line x1="0" y1={(chartTop + chartBottom) / 2} x2={chartWidth} y2={(chartTop + chartBottom) / 2} className="ijara-grid-line" />
                <line x1="0" y1={chartBottom} x2={chartWidth} y2={chartBottom} className="ijara-axis-line" />
                <path d={equityPath} className="ijara-area-equity" />
                <path d={rentPath} className="ijara-area-rent" />
                <text x="0" y={chartBottom + 15}>Month 1</text>
                <text x={chartWidth} y={chartBottom + 15} textAnchor="end">Month {monthCount}</text>
              </svg>
            </div>
          </section>

          <section className="panel ijara-table-section">
            <div className="ijara-section-heading">
              <div>
                <p className="eyebrow">MONTH-BY-MONTH SCHEDULE</p>
                <h2>Monthly rent and equity breakdown</h2>
              </div>
              <span className="ijara-term-chip">{termYears} {termYears === 1 ? "year" : "years"} · {rows.length} months</span>
            </div>
            <div className="cashflow-scroll ijara-table-scroll">
              <table className="cashflow-table ijara-table">
                <thead>
                  <tr>
                    <th>Year</th>
                    <th>Month</th>
                    <th>Monthly payment</th>
                    <th>Rent portion</th>
                    <th>Equity built</th>
                    <th>Cumulative equity</th>
                    <th>Remaining financed</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.month}>
                      <td>{row.year}</td>
                      <td>{row.month}</td>
                      <td>{money.format(row.monthlyPayment)}</td>
                      <td>{money.format(row.rent)}</td>
                      <td>{money.format(row.equity)}</td>
                      <td>{money.format(row.cumulativeEquity)}</td>
                      <td>{money.format(row.remainingFinanced)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <p className="ijara-note">
            Ijara: Lease-to-own, bank owns property and leases to you - no interest, AAOIFI
          </p>
          <p className="ijara-residual-disclaimer">
            Residual value is shown for reference only and is not included in the payment formula or total paid.
          </p>
        </>
      )}
      <SaveCalculationButton
        calculatorType="Ijara"
        disabled={!valid}
        inputs={{
          propertyPrice,
          downPaymentPercent,
          ijaraRate: rate,
          leaseTermYears: termYears,
          residualValuePercent: residualPercent,
        }}
        results={{ monthlyPayment, totalPaid, totalRent, downAmount, financed, residualValue }}
      />
    </div>
  );
}

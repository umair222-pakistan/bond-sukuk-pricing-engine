import { useMemo, useState, type FormEvent } from "react";
import { saveCalculation } from "./history";
import SaveCalculationButton from "../components/SaveCalculationButton";

type Installment = {
  month: number;
  payment: number;
  profit: number;
  principal: number;
  balance: number;
};

const money = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPercent = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function MurabahaCalculator() {
  const [assetCost, setAssetCost] = useState("10000");
  const [profitRate, setProfitRate] = useState("8");
  const [tenureMonths, setTenureMonths] = useState("24");
  const [downPayment, setDownPayment] = useState("1000");
  const [error, setError] = useState<string | null>(null);

  const cost = Number(assetCost);
  const rate = Number(profitRate);
  const tenure = Number(tenureMonths);
  const down = Number(downPayment);
  const profitAmount = cost * (rate / 100) * (tenure / 12);
  const totalPayable = cost + profitAmount;
  const monthlyInstallment = tenure > 0 ? (totalPayable - down) / tenure : 0;
  const profitRatio = cost > 0 ? (profitAmount / cost) * 100 : 0;
  const hasValidInputs =
    Number.isFinite(cost) &&
    cost > 0 &&
    Number.isFinite(rate) &&
    rate >= 0 &&
    Number.isInteger(tenure) &&
    tenure > 0 &&
    Number.isFinite(down) &&
    down >= 0 &&
    down <= totalPayable;

  const installments = useMemo<Installment[]>(() => {
    if (!hasValidInputs) return [];

    let balance = totalPayable - down;
    const monthlyProfit = profitAmount / tenure;
    return Array.from({ length: tenure }, (_, index) => {
      const payment = Math.min(monthlyInstallment, balance);
      const profit = Math.min(monthlyProfit, payment);
      const principal = payment - profit;
      balance = Math.max(0, balance - payment);
      return { month: index + 1, payment, profit, principal, balance };
    });
  }, [down, hasValidInputs, monthlyInstallment, profitAmount, tenure, totalPayable]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!hasValidInputs) {
      setError("Enter a positive asset cost and tenure, and a down payment no greater than the total payable.");
      return;
    }
    try {
      saveCalculation({
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
        instrument: "Murabaha",
        face: cost,
        coupon: rate,
        yieldRate: 0,
        years: tenure / 12,
        frequency: 12,
        price: totalPayable,
      });
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "browser storage is unavailable";
      setError(`Calculation completed, but could not be saved to local history: ${reason}`);
    }
  }

  const maxPayment = Math.max(...installments.map((item) => item.payment), 0);

  return (
    <div className="murabaha-calculator">
      <form className="panel inputs murabaha-inputs" onSubmit={handleSubmit}>
        <label>
          Asset Cost
          <input
            type="number"
            min="0.01"
            step="0.01"
            required
            value={assetCost}
            onChange={(event) => setAssetCost(event.target.value)}
          />
        </label>
        <label>
          Profit Rate %
          <input
            type="number"
            min="0"
            step="0.01"
            required
            value={profitRate}
            onChange={(event) => setProfitRate(event.target.value)}
          />
        </label>
        <label>
          Tenure months
          <input
            type="number"
            min="1"
            step="1"
            required
            value={tenureMonths}
            onChange={(event) => setTenureMonths(event.target.value)}
          />
        </label>
        <label>
          Down Payment
          <input
            type="number"
            min="0"
            step="0.01"
            required
            value={downPayment}
            onChange={(event) => setDownPayment(event.target.value)}
          />
        </label>
        <button className="go" type="submit">Save Calculation</button>
        {error ? <p className="err" role="alert">{error}</p> : null}
      </form>

      {!hasValidInputs ? (
        <p className="murabaha-validation" role="alert">
          Check the entered values. Down payment must not exceed total payable.
        </p>
      ) : (
        <>
          <section className="murabaha-summary" aria-label="Murabaha calculation summary">
            <article className="panel murabaha-metric">
              <span>Total Payable</span>
              <strong>{money.format(totalPayable)}</strong>
            </article>
            <article className="panel murabaha-metric">
              <span>Monthly Installment</span>
              <strong>{money.format(monthlyInstallment)}</strong>
            </article>
            <article className="panel murabaha-metric">
              <span>Profit Amount</span>
              <strong>{money.format(profitAmount)}</strong>
            </article>
            <article className="panel murabaha-metric">
              <span>Profit Ratio</span>
              <strong>{fmtPercent.format(profitRatio)}%</strong>
            </article>
          </section>

          <section className="panel murabaha-chart-section">
            <h2>Monthly payment schedule</h2>
            <div className="murabaha-chart" role="img" aria-label="Monthly Murabaha installment amounts">
              {installments.map((item) => (
                <div className="murabaha-bar-column" key={item.month}>
                  <div className="murabaha-bar-track">
                    <div
                      className="murabaha-bar"
                      style={{ height: `${maxPayment ? (item.payment / maxPayment) * 100 : 0}%` }}
                      title={`Month ${item.month}: ${money.format(item.payment)}`}
                    />
                  </div>
                  <span>{item.month}</span>
                </div>
              ))}
            </div>
            <div className="murabaha-chart-caption">Month</div>
          </section>

          <section className="panel murabaha-table-section">
            <h2>Installment table</h2>
            <div className="cashflow-scroll">
              <table className="cashflow-table">
                <thead>
                  <tr><th>Month</th><th>Installment</th><th>Profit portion</th><th>Cost portion</th><th>Balance</th></tr>
                </thead>
                <tbody>
                  {installments.map((item) => (
                    <tr key={item.month}>
                      <td>{item.month}</td>
                      <td>{money.format(item.payment)}</td>
                      <td>{money.format(item.profit)}</td>
                      <td>{money.format(item.principal)}</td>
                      <td>{money.format(item.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <p className="murabaha-note">
            Murabaha is cost-plus sale, not interest-based loan - AAOIFI Standard
          </p>
        </>
      )}
      <SaveCalculationButton
        calculatorType="Murabaha"
        disabled={!hasValidInputs}
        inputs={{ assetCost: cost, profitRate: rate, tenureMonths: tenure, downPayment: down }}
        results={{ totalPayable, monthlyInstallment, profitAmount, profitRatio }}
      />
    </div>
  );
}

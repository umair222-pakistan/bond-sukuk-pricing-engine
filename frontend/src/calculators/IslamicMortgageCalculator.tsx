import { useMemo, useState, type FormEvent } from "react";
import SaveCalculationButton from "../components/SaveCalculationButton";
import { useLicense } from "../hooks/useLicense";
import ActionBar from "../features/phase18/components/ActionBar";
import { useVault } from "../features/phase18/hooks/useVault";

type FinanceType = "Murabaha" | "Diminishing Musharakah" | "Ijara";
type PaymentRow = {
  month: number;
  payment: number;
  principal: number;
  profit: number;
  balance: number;
};

const money = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function buildSchedule(principal: number, annualRatePercent: number, years: number, type: FinanceType): PaymentRow[] {
  const months = years * 12;
  const principalPerMonth = principal / months;
  const flatProfitPerMonth = principal * annualRatePercent / 100 / 12;
  let balance = principal;
  return Array.from({ length: months }, (_, index) => {
    const month = index + 1;
    const profit = type === "Murabaha"
      ? principal * annualRatePercent / 100 * years / months
      : type === "Ijara"
        ? flatProfitPerMonth
        : balance * annualRatePercent / 100 / 12;
    const paidPrincipal = Math.min(principalPerMonth, balance);
    balance = Math.max(0, balance - paidPrincipal);
    return { month, payment: paidPrincipal + profit, principal: paidPrincipal, profit, balance };
  });
}

export default function IslamicMortgageCalculator() {
  const { consumeFreeCalculation, freeCalculationsUsed, tier } = useLicense();
  const { deals: vaultDeals } = useVault();
  const freeLimitReached = tier === "free" && freeCalculationsUsed >= 1;
  const [hasCalculated, setHasCalculated] = useState(false);
  const [propertyPrice, setPropertyPrice] = useState("300000");
  const [downPaymentPercent, setDownPaymentPercent] = useState("20");
  const [profitRatePercent, setProfitRatePercent] = useState("5");
  const [tenureYears, setTenureYears] = useState("25");
  const [type, setType] = useState<FinanceType>("Diminishing Musharakah");

  const price = Number(propertyPrice);
  const downPercent = Number(downPaymentPercent);
  const rate = Number(profitRatePercent);
  const years = Number(tenureYears);
  const financed = price * (1 - downPercent / 100);
  const valid =
    Number.isFinite(price) && price > 0 &&
    Number.isFinite(downPercent) && downPercent >= 0 && downPercent <= 100 &&
    Number.isFinite(rate) && rate >= 0 &&
    Number.isInteger(years) && years >= 1 && years <= 40;
  const schedule = useMemo(
    () => valid ? buildSchedule(financed, rate, years, type) : [],
    [financed, rate, years, type, valid],
  );
  const totalProfit = schedule.reduce((sum, row) => sum + row.profit, 0);
  const totalPaid = price * downPercent / 100 + financed + totalProfit;
  const monthlyPayment = schedule[0]?.payment ?? 0;
  const inputs = useMemo(
    () => ({ propertyPrice: price, downPaymentPercent: downPercent, profitRatePercent: rate, tenureYears: years, type }),
    [price, downPercent, rate, years, type],
  );
  const results = useMemo(
    () => ({ monthlyPayment, totalProfit, totalPaid, amortizationSchedule: schedule }),
    [monthlyPayment, totalProfit, totalPaid, schedule],
  );

  function handleCalculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid) return;
    if (!consumeFreeCalculation()) return;
    setHasCalculated(true);
  }

  return (
    <div className="special-calculator">
      <form className="panel inputs special-calculator-inputs" onSubmit={handleCalculate}>
        <label>Property Price
          <input type="number" min="0.01" step="0.01" required value={propertyPrice} disabled={freeLimitReached} onChange={(event) => setPropertyPrice(event.target.value)} />
        </label>
        <label>Down Payment %
          <input type="number" min="0" max="100" step="0.01" required value={downPaymentPercent} disabled={freeLimitReached} onChange={(event) => setDownPaymentPercent(event.target.value)} />
        </label>
        <label>Profit Rate % annual
          <input type="number" min="0" step="0.01" required value={profitRatePercent} disabled={freeLimitReached} onChange={(event) => setProfitRatePercent(event.target.value)} />
        </label>
        <label>Tenure Years
          <input type="number" min="1" max="40" step="1" required value={tenureYears} disabled={freeLimitReached} onChange={(event) => setTenureYears(event.target.value)} />
        </label>
        <label>Finance Type
          <select value={type} disabled={freeLimitReached} onChange={(event) => setType(event.target.value as FinanceType)}>
            <option value="Murabaha">Murabaha</option>
            <option value="Diminishing Musharakah">Diminishing Musharakah</option>
            <option value="Ijara">Ijara</option>
          </select>
        </label>
        <button className="go" type="submit" disabled={!valid || freeLimitReached}>Calculate Schedule</button>
      </form>

      {tier === "free" && !hasCalculated ? (
        <p className="calculator-validation">Calculate once to use your free calculation.</p>
      ) : !valid ? <p className="calculator-validation" role="alert">Enter a positive property price, a down payment from 0–100%, a non-negative profit rate, and a tenure from 1–40 whole years.</p> : (
        <>
          <section className="special-calculator-summary" aria-label="Islamic mortgage calculation results">
            <article className="panel special-calculator-metric"><span>Monthly Payment</span><strong>{money.format(monthlyPayment)}</strong><small>First scheduled payment</small></article>
            <article className="panel special-calculator-metric"><span>Total Profit / Rent</span><strong>{money.format(totalProfit)}</strong></article>
            <article className="panel special-calculator-metric"><span>Total Paid</span><strong>{money.format(totalPaid)}</strong></article>
          </section>
          <section className="panel mortgage-schedule-section">
            <div className="mortgage-schedule-heading">
              <div><p className="eyebrow">PAYMENT PLAN</p><h2>{type} amortization schedule</h2></div>
              <span>{schedule.length} monthly payments</span>
            </div>
            <div className="cashflow-scroll">
              <table className="cashflow-table">
                <thead><tr><th>Month</th><th>Payment</th><th>Principal / Equity</th><th>Profit / Rent</th><th>Balance</th></tr></thead>
                <tbody>
                  {schedule.map((row) => (
                    <tr key={row.month}>
                      <td>{row.month}</td>
                      <td>{money.format(row.payment)}</td>
                      <td>{money.format(row.principal)}</td>
                      <td>{money.format(row.profit)}</td>
                      <td>{money.format(row.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <p className="calculator-assumption">
            Illustrative estimate, not a bank quote. Murabaha uses fixed simple profit on the original financed amount over the full term. Ijara uses a flat rent on the original balance plus equal monthly equity. Diminishing Musharakah uses equal monthly equity buyouts and rent on the declining balance. Fees, taxes, insurance, residual value, and contract-specific terms are excluded.
          </p>
        </>
      )}
      <SaveCalculationButton
        calculatorType="Islamic Mortgage"
        inputs={inputs}
        results={results}
        disabled={!valid || (tier === "free" && !hasCalculated)}
      />
      {valid && hasCalculated ? (
        <ActionBar
          dealType="Islamic Mortgage"
          vaultDealCount={vaultDeals.length}
          inputs={inputs}
          results={{ ...results, totalProfit, totalProfitOrRent: totalProfit, yield: rate }}
        />
      ) : null}
    </div>
  );
}

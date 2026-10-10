import { useMemo, useState, type FormEvent } from "react";
import SaveCalculationButton from "../components/SaveCalculationButton";
import ActionBar from "../features/phase18/components/ActionBar";
import { useVault } from "../features/phase18/hooks/useVault";

const money = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export default function MudarabaCalculator() {
  const { deals: vaultDeals } = useVault();
  const [capital, setCapital] = useState("100000");
  const [netProfit, setNetProfit] = useState("20000");
  const [investorSharePercent, setInvestorSharePercent] = useState("60");
  const [calculated, setCalculated] = useState(false);

  const capitalValue = Number(capital);
  const profitValue = Number(netProfit);
  const investorShare = Number(investorSharePercent);
  const valid =
    Number.isFinite(capitalValue) &&
    capitalValue > 0 &&
    Number.isFinite(profitValue) &&
    profitValue >= 0 &&
    Number.isFinite(investorShare) &&
    investorShare >= 0 &&
    investorShare <= 100;
  const investorProfit = valid ? profitValue * investorShare / 100 : 0;
  const entrepreneurProfit = valid ? profitValue - investorProfit : 0;
  const inputs = useMemo(
    () => ({ capital: capitalValue, netProfit: profitValue, investorSharePercent: investorShare }),
    [capitalValue, investorShare, profitValue],
  );
  const results = useMemo(
    () => ({ investorProfit, entrepreneurProfit, totalProfit: profitValue }),
    [entrepreneurProfit, investorProfit, profitValue],
  );

  function calculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (valid) setCalculated(true);
  }

  return (
    <div className="mudaraba-calculator">
      <form className="panel inputs" onSubmit={calculate}>
        <label>
          Invested capital
          <input
            type="number"
            min="0.01"
            step="0.01"
            required
            value={capital}
            onChange={(event) => setCapital(event.target.value)}
          />
        </label>
        <label>
          Net profit
          <input
            type="number"
            min="0"
            step="0.01"
            required
            value={netProfit}
            onChange={(event) => setNetProfit(event.target.value)}
          />
        </label>
        <label>
          Investor's agreed profit share %
          <input
            type="number"
            min="0"
            max="100"
            step="0.01"
            required
            value={investorSharePercent}
            onChange={(event) => setInvestorSharePercent(event.target.value)}
          />
        </label>
        <button className="go" type="submit" disabled={!valid}>Calculate allocation</button>
      </form>
      {!valid ? (
        <p className="calculator-validation" role="alert">
          Enter positive capital, non-negative profit, and an agreed share from 0–100%.
        </p>
      ) : calculated ? (
        <section className="special-calculator-summary" aria-label="Mudaraba profit allocation">
          <article className="panel special-calculator-metric">
            <span>Investor profit</span>
            <strong>{money.format(investorProfit)}</strong>
          </article>
          <article className="panel special-calculator-metric">
            <span>Entrepreneur profit</span>
            <strong>{money.format(entrepreneurProfit)}</strong>
          </article>
          <article className="panel special-calculator-metric">
            <span>Total profit</span>
            <strong>{money.format(profitValue)}</strong>
          </article>
          <p className="calculator-assumption">
            Educational estimate based on the entered profit-sharing ratio. It does not model capital loss, fees, contract terms, or Shariah rulings; consult qualified professionals.
          </p>
        </section>
      ) : (
        <p className="calculator-validation">Enter your figures and calculate the indicative profit allocation.</p>
      )}
      <SaveCalculationButton
        calculatorType="Mudaraba"
        inputs={inputs}
        results={results}
        disabled={!valid || !calculated}
      />
      {valid && calculated ? (
        <ActionBar
          dealType="Mudaraba"
          vaultDealCount={vaultDeals.length}
          inputs={inputs}
          results={{ ...results, totalProfit: profitValue, yield: capitalValue ? profitValue / capitalValue * 100 : 0 }}
        />
      ) : null}
    </div>
  );
}

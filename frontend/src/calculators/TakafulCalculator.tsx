import { useMemo, useState } from "react";
import SaveCalculationButton from "../components/SaveCalculationButton";
import ActionBar from "../features/phase18/components/ActionBar";
import { useVault } from "../features/phase18/hooks/useVault";

type Model = "Wakalah" | "Mudarabah";

const money = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function TakafulCalculator() {
  const { deals: vaultDeals } = useVault();
  const [age, setAge] = useState("35");
  const [coverageAmount, setCoverageAmount] = useState("100000");
  const [termYears, setTermYears] = useState("20");
  const [model, setModel] = useState<Model>("Wakalah");
  const [tabarruPercent, setTabarruPercent] = useState("70");

  const ageValue = Number(age);
  const coverage = Number(coverageAmount);
  const term = Number(termYears);
  const tabarruRate = Number(tabarruPercent);
  const annualRiskRatePercent = 0.1 + ageValue * 0.01;
  const monthlyContribution = coverage * annualRiskRatePercent / 100 / 12;
  const total = monthlyContribution * term * 12;
  const tabarruPool = total * tabarruRate / 100;
  const surplusShare = model === "Wakalah" ? 1 : 0.7;
  const surplus = tabarruPool * 0.1 * surplusShare;
  const valid =
    Number.isInteger(ageValue) && ageValue >= 18 && ageValue <= 100 &&
    Number.isFinite(coverage) && coverage > 0 &&
    Number.isInteger(term) && term >= 1 && term <= 50 &&
    Number.isFinite(tabarruRate) && tabarruRate >= 0 && tabarruRate <= 100;

  const inputs = useMemo(
    () => ({ age: ageValue, coverageAmount: coverage, termYears: term, model, tabarruPercent: tabarruRate }),
    [ageValue, coverage, term, model, tabarruRate],
  );
  const results = useMemo(
    () => ({ monthlyContribution, total, surplus, tabarruPool, annualRiskRatePercent }),
    [monthlyContribution, total, surplus, tabarruPool, annualRiskRatePercent],
  );

  return (
    <div className="special-calculator">
      <form className="panel inputs special-calculator-inputs" onSubmit={(event) => event.preventDefault()}>
        <label>Age
          <input type="number" min="18" max="100" step="1" required value={age} onChange={(event) => setAge(event.target.value)} />
        </label>
        <label>Coverage Amount
          <input type="number" min="0.01" step="0.01" required value={coverageAmount} onChange={(event) => setCoverageAmount(event.target.value)} />
        </label>
        <label>Term Years
          <input type="number" min="1" max="50" step="1" required value={termYears} onChange={(event) => setTermYears(event.target.value)} />
        </label>
        <label>Model
          <select value={model} onChange={(event) => setModel(event.target.value as Model)}>
            <option value="Wakalah">Wakalah</option>
            <option value="Mudarabah">Mudarabah</option>
          </select>
        </label>
        <label>Tabarru %
          <input type="number" min="0" max="100" step="0.01" required value={tabarruPercent} onChange={(event) => setTabarruPercent(event.target.value)} />
        </label>
      </form>

      {!valid ? <p className="calculator-validation" role="alert">Enter an age from 18–100, positive coverage, a term from 1–50 whole years, and a Tabarru allocation from 0–100%.</p> : (
        <>
          <section className="special-calculator-summary" aria-label="Takaful calculation results">
            <article className="panel special-calculator-metric"><span>Monthly Contribution</span><strong>{money.format(monthlyContribution)}</strong></article>
            <article className="panel special-calculator-metric"><span>Total Contributions</span><strong>{money.format(total)}</strong></article>
            <article className="panel special-calculator-metric"><span>Illustrative Surplus</span><strong>{money.format(surplus)}</strong></article>
            <article className="panel special-calculator-metric"><span>Tabarru Pool</span><strong>{money.format(tabarruPool)}</strong></article>
          </section>
          <p className="calculator-assumption">
            Illustration only: annual contribution rate is assumed as 0.1% + 0.01% per year of age. Tabarru pool is the selected share of contributions. Potential surplus assumes no claims and a 10% pool surplus; Wakalah allocates 100% to participants and Mudarabah 70%. Actual Takaful pricing, surplus, and allocation are contract-specific.
          </p>
        </>
      )}
      <SaveCalculationButton calculatorType="Takaful" inputs={inputs} results={results} disabled={!valid} />
      {valid ? (
        <ActionBar
          dealType="Takaful"
          vaultDealCount={vaultDeals.length}
          inputs={inputs}
          results={{ ...results, monthlyPayment: monthlyContribution, totalProfit: total, yield: annualRiskRatePercent }}
        />
      ) : null}
    </div>
  );
}

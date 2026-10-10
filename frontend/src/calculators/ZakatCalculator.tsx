import { useState, type FormEvent } from "react";
import { saveCalculation } from "./history";
import SaveCalculationButton from "../components/SaveCalculationButton";
import { useLicense } from "../hooks/useLicense";
import ActionBar from "../features/phase18/components/ActionBar";
import { useVault } from "../features/phase18/hooks/useVault";

type ZakatInputs = {
  goldValue: string;
  silverValue: string;
  cashSavings: string;
  inventory: string;
  receivables: string;
  debtsOwed: string;
  goldPricePerGram: string;
};

const amountFormat = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const initialInputs: ZakatInputs = {
  goldValue: "0",
  silverValue: "0",
  cashSavings: "0",
  inventory: "0",
  receivables: "0",
  debtsOwed: "0",
  goldPricePerGram: "0",
};

const assetFields: { key: keyof ZakatInputs; label: string }[] = [
  { key: "goldValue", label: "Gold value" },
  { key: "silverValue", label: "Silver value" },
  { key: "cashSavings", label: "Cash savings" },
  { key: "inventory", label: "Business inventory" },
  { key: "receivables", label: "Debts owed to you" },
  { key: "debtsOwed", label: "Debts you owe" },
];

export default function ZakatCalculator() {
  const { consumeFreeCalculation, freeCalculationsUsed, tier } = useLicense();
  const { deals: vaultDeals } = useVault();
  const freeLimitReached = tier === "free" && freeCalculationsUsed >= 1;
  const [hasCalculated, setHasCalculated] = useState(false);
  const [inputs, setInputs] = useState<ZakatInputs>(initialInputs);
  const [error, setError] = useState<string | null>(null);

  const values = Object.fromEntries(
    Object.entries(inputs).map(([key, value]) => [key, Number(value)])
  ) as Record<keyof ZakatInputs, number>;
  const nisab = 85 * values.goldPricePerGram;
  const totalAssets =
    values.goldValue +
    values.silverValue +
    values.cashSavings +
    values.inventory +
    values.receivables;
  const zakatableWealth = Math.max(0, totalAssets - values.debtsOwed);
  const isEligible = zakatableWealth >= nisab;
  const zakatPayable = isEligible ? zakatableWealth * 0.025 : 0;
  const valid =
    Object.values(values).every((value) => Number.isFinite(value) && value >= 0) &&
    values.goldPricePerGram > 0;

  function updateInput(key: keyof ZakatInputs, value: string) {
    setInputs((previous) => ({ ...previous, [key]: value }));
    setError(null);
  }

  function saveResult(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!valid) {
      setError("Enter valid, non-negative amounts for all values.");
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
        instrument: "Zakat",
        face: zakatableWealth,
        coupon: 2.5,
        yieldRate: 0,
        years: 1,
        frequency: 1,
        price: zakatPayable,
      });
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "browser storage is unavailable";
      setError(`Calculation completed, but could not be saved to local history: ${reason}`);
    }
  }

  return (
    <div className="zakat-calculator">
      <form className="panel inputs zakat-inputs" onSubmit={saveResult}>
        <label className="gold-price-field">
          Gold price per gram
          <input
            type="number"
            min="0"
            step="0.01"
            value={inputs.goldPricePerGram}
            disabled={freeLimitReached}
            onChange={(event) => updateInput("goldPricePerGram", event.target.value)}
            required
          />
        </label>
        <div className="zakat-fields">
          {assetFields.map(({ key, label }) => (
            <label key={key}>
              {label}
              <input
                type="number"
                min="0"
                step="0.01"
                value={inputs[key]}
                disabled={freeLimitReached}
                onChange={(event) => updateInput(key, event.target.value)}
                required
              />
            </label>
          ))}
        </div>
        <button className="go" type="submit" disabled={!valid}>Save Calculation</button>
        {error ? <p className="err" role="alert">{error}</p> : null}
      </form>

      {tier === "free" && !hasCalculated ? (
        <p className="zakat-validation">Submit once to use your free calculation.</p>
      ) : !valid ? (
        <p className="zakat-validation" role="alert">
          Enter valid non-negative amounts and a gold price per gram greater than zero.
        </p>
      ) : (
        <>
          <section className="zakat-metrics" aria-label="Zakat calculation summary">
            <article className="panel zakat-metric">
              <span>Nisab threshold</span>
              <strong>{amountFormat.format(nisab)}</strong>
              <small>85 g gold</small>
            </article>
            <article className="panel zakat-metric">
              <span>Total zakatable wealth</span>
              <strong>{amountFormat.format(zakatableWealth)}</strong>
              <small>Assets less debts owed</small>
            </article>
            <article className="panel zakat-metric">
              <span>Zakat payable</span>
              <strong>{amountFormat.format(zakatPayable)}</strong>
              <small>2.5% when eligible</small>
            </article>
            <article className="panel zakat-metric">
              <span>Eligible?</span>
              <strong className={isEligible ? "eligible-label" : "not-eligible-label"}>
                {isEligible ? "Yes" : "No"}
              </strong>
              <small>{isEligible ? "Wealth meets nisab" : "Wealth is below nisab"}</small>
            </article>
          </section>

          <section className={`zakat-result ${isEligible ? "zakat-due" : "zakat-not-due"}`} aria-live="polite">
            <span className="zakat-result-icon" aria-hidden="true">{isEligible ? "✓" : "–"}</span>
            <div>
              <p className="zakat-result-eyebrow">{isEligible ? "ZAKAT IS DUE" : "NO ZAKAT DUE"}</p>
              <h2>{isEligible ? amountFormat.format(zakatPayable) : "No Zakat due - below Nisab"}</h2>
              {isEligible ? <p>Estimated Zakat payable at 2.5% of zakatable wealth.</p> : null}
            </div>
          </section>

          <p className="zakat-note">
            Nisab based on 85g gold - Hanafi standard, consult scholar
          </p>
        </>
      )}
      <SaveCalculationButton
        calculatorType="Zakat"
        disabled={!valid}
        inputs={Object.fromEntries(Object.entries(inputs).map(([key, value]) => [key, Number(value)]))}
        results={{ nisab, zakatableWealth, zakatPayable, eligible: isEligible }}
      />
      {valid && hasCalculated ? (
        <ActionBar
          dealType="Zakat"
          vaultDealCount={vaultDeals.length}
          inputs={Object.fromEntries(Object.entries(inputs).map(([key, value]) => [key, Number(value)]))}
          results={{ nisab, zakatableWealth, zakatPayable, eligible: isEligible, totalProfit: zakatPayable }}
        />
      ) : null}
    </div>
  );
}

import { useCallback, useState } from "react";

export const DEALS_STORAGE_KEY = "noorfinance_deals";
export const COMPARE_STORAGE_KEY = "noorfinance_compare";

export type VaultDeal = {
  id: string;
  calculator_type: string;
  title: string;
  inputs: Record<string, unknown>;
  results: Record<string, unknown>;
  created_at: string;
  share_token?: string;
};

function isVaultDeal(value: unknown): value is VaultDeal {
  if (typeof value !== "object" || value === null) return false;
  const deal = value as Record<string, unknown>;
  return (
    typeof deal.id === "string" &&
    typeof deal.calculator_type === "string" &&
    typeof deal.title === "string" &&
    typeof deal.created_at === "string" &&
    typeof deal.inputs === "object" &&
    deal.inputs !== null &&
    !Array.isArray(deal.inputs) &&
    typeof deal.results === "object" &&
    deal.results !== null &&
    !Array.isArray(deal.results)
  );
}

function readDeals(): { deals: VaultDeal[]; error: string | null } {
  try {
    const stored = window.localStorage.getItem(DEALS_STORAGE_KEY);
    if (!stored) return { deals: [], error: null };
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed) || !parsed.every(isVaultDeal)) {
      throw new Error("Saved vault data has an unexpected format.");
    }
    return { deals: parsed, error: null };
  } catch (cause) {
    return {
      deals: [],
      error: cause instanceof Error ? cause.message : "Unable to read saved vault data.",
    };
  }
}

export function useVault() {
  const [initial] = useState(readDeals);
  const [deals, setDeals] = useState(initial.deals);
  const [error, setError] = useState<string | null>(initial.error);

  const persistDeals = useCallback((nextDeals: VaultDeal[]) => {
    window.localStorage.setItem(DEALS_STORAGE_KEY, JSON.stringify(nextDeals));
    setDeals(nextDeals);
    setError(null);
  }, []);

  const saveDeal = useCallback(
    (calculatorType: string, inputs: Record<string, unknown>, results: Record<string, unknown>): VaultDeal => {
      const latest = readDeals();
      if (latest.error) throw new Error(latest.error);
      const now = new Date();
      const deal: VaultDeal = {
        id: crypto.randomUUID(),
        calculator_type: calculatorType,
        title: `${calculatorType} - ${now.toLocaleDateString()}`,
        inputs,
        results,
        created_at: now.toISOString(),
      };
      persistDeals([deal, ...latest.deals]);
      return deal;
    },
    [persistDeals],
  );

  const listDeals = useCallback(() => deals, [deals]);

  const deleteDeal = useCallback(
    (id: string) => {
      const latest = readDeals();
      if (latest.error) throw new Error(latest.error);
      const storedCompare = window.localStorage.getItem(COMPARE_STORAGE_KEY);
      if (storedCompare) {
        const compareIds: unknown = JSON.parse(storedCompare);
        if (!Array.isArray(compareIds) || !compareIds.every((compareId) => typeof compareId === "string")) {
          throw new Error("Saved comparison data has an unexpected format.");
        }
        window.localStorage.setItem(
          COMPARE_STORAGE_KEY,
          JSON.stringify(compareIds.filter((compareId) => compareId !== id)),
        );
      }
      persistDeals(latest.deals.filter((deal) => deal.id !== id));
    },
    [persistDeals],
  );

  const setShareToken = useCallback(
    (id: string, token: string) => {
      const latest = readDeals();
      if (latest.error) throw new Error(latest.error);
      const nextDeals = latest.deals.map((deal) => (deal.id === id ? { ...deal, share_token: token } : deal));
      persistDeals(nextDeals);
      return nextDeals.find((deal) => deal.id === id);
    },
    [persistDeals],
  );

  return { deals, error, listDeals, saveDeal, deleteDeal, setShareToken };
}

import { useCallback, useEffect, useState } from "react";

export const DEALS_STORAGE_KEY = "noorfinance_deals";
export const VAULT_BACKUP_STORAGE_KEY = "vault-local-backup";
export const COMPARE_STORAGE_KEY = "noorfinance_compare";

export type VaultDeal = {
  id: string;
  calculator_type: string;
  title: string;
  inputs: Record<string, unknown>;
  results: Record<string, unknown>;
  created_at: string;
  share_token?: string;
  tags?: string[];
};

function isVaultDeal(value: unknown): value is VaultDeal {
  if (typeof value !== "object" || value === null) return false;
  const deal = value as Record<string, unknown>;
  return (
    typeof deal.id === "string" &&
    typeof deal.calculator_type === "string" &&
    typeof deal.title === "string" &&
    typeof deal.created_at === "string" &&
    (deal.tags === undefined || (Array.isArray(deal.tags) && deal.tags.every((tag) => typeof tag === "string"))) &&
    typeof deal.inputs === "object" &&
    deal.inputs !== null &&
    !Array.isArray(deal.inputs) &&
    typeof deal.results === "object" &&
    deal.results !== null &&
    !Array.isArray(deal.results)
  );
}

function readDealsFromKey(key: string): { deals: VaultDeal[]; error: string | null; present: boolean } {
  try {
    const stored = window.localStorage.getItem(key);
    if (stored === null) return { deals: [], error: null, present: false };
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed) || !parsed.every(isVaultDeal)) {
      throw new Error("Saved vault data has an unexpected format.");
    }
    return { deals: parsed, error: null, present: true };
  } catch (cause) {
    return {
      deals: [],
      error: cause instanceof Error ? cause.message : "Unable to read saved vault data.",
      present: false,
    };
  }
}

function readDeals(): { deals: VaultDeal[]; error: string | null } {
  const primary = readDealsFromKey(DEALS_STORAGE_KEY);
  const backup = readDealsFromKey(VAULT_BACKUP_STORAGE_KEY);
  if (primary.present) return { deals: primary.deals, error: primary.error };
  return {
    deals: [...backup.deals].sort(
      (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
    ),
    error: primary.error ?? backup.error,
  };
}

export function useVault() {
  const [initial] = useState(readDeals);
  const [deals, setDeals] = useState(initial.deals);
  const [error, setError] = useState<string | null>(initial.error);

  const persistDeals = useCallback((nextDeals: VaultDeal[]) => {
    const serialized = JSON.stringify(nextDeals);
    window.localStorage.setItem(DEALS_STORAGE_KEY, serialized);
    window.localStorage.setItem(VAULT_BACKUP_STORAGE_KEY, serialized);
    setDeals(nextDeals);
    setError(null);
    window.dispatchEvent(new Event("noorfinance:vault-updated"));
  }, []);

  useEffect(() => {
    const refreshDeals = () => {
      const latest = readDeals();
      setDeals(latest.deals);
      setError(latest.error);
    };
    window.addEventListener("storage", refreshDeals);
    window.addEventListener("noorfinance:vault-updated", refreshDeals);
    return () => {
      window.removeEventListener("storage", refreshDeals);
      window.removeEventListener("noorfinance:vault-updated", refreshDeals);
    };
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

  const updateDeal = useCallback(
    (id: string, changes: Partial<Pick<VaultDeal, "title" | "tags">>) => {
      const latest = readDeals();
      if (latest.error) throw new Error(latest.error);
      const nextDeals = latest.deals.map((deal) => deal.id === id ? { ...deal, ...changes } : deal);
      if (!nextDeals.some((deal) => deal.id === id)) throw new Error("Deal not found in the local vault.");
      persistDeals(nextDeals);
    },
    [persistDeals],
  );

  const duplicateDeal = useCallback(
    (id: string) => {
      const latest = readDeals();
      if (latest.error) throw new Error(latest.error);
      const original = latest.deals.find((deal) => deal.id === id);
      if (!original) throw new Error("Deal not found in the local vault.");
      const duplicate: VaultDeal = {
        ...original,
        id: crypto.randomUUID(),
        title: `${original.title} (Copy)`,
        created_at: new Date().toISOString(),
        share_token: undefined,
        tags: original.tags ? [...original.tags] : [],
      };
      persistDeals([duplicate, ...latest.deals]);
      return duplicate;
    },
    [persistDeals],
  );

  return { deals, error, listDeals, saveDeal, deleteDeal, setShareToken, updateDeal, duplicateDeal };
}

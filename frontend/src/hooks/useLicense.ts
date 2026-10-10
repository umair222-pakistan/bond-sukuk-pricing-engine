import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useAdmin } from "./useAdmin";

export type SubscriptionTier = "free" | "basic" | "pro" | "enterprise";
export type PaidSubscriptionTier = Exclude<SubscriptionTier, "free">;

type LicenseResponse = {
  valid?: boolean;
  hasLicense?: boolean;
  plan?: string;
  tier?: string;
  error?: string;
};

const PAID_TIERS = new Set<SubscriptionTier>(["basic", "pro", "enterprise"]);
const TIER_RANK: Record<SubscriptionTier, number> = {
  free: 0,
  basic: 1,
  pro: 2,
  enterprise: 3,
};
const FREE_CALCULATION_COUNT_KEY = "noorfinance-free-calculation-count";

function normalizedTier(value: unknown): SubscriptionTier {
  if (typeof value === "string" && PAID_TIERS.has(value.toLowerCase() as SubscriptionTier)) {
    return value.toLowerCase() as SubscriptionTier;
  }
  return "free";
}

function readFreeCalculationCount(): number {
  const value = Number(window.localStorage.getItem(FREE_CALCULATION_COUNT_KEY) ?? "0");
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

export function useLicense() {
  const [tier, setTier] = useState<SubscriptionTier>("free");
  const [freeCalculationsUsed, setFreeCalculationsUsed] = useState(readFreeCalculationCount);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const { session, user, loading: authLoading } = useAuth();
  const { isAdmin } = useAdmin();
  const userEmail = user?.email?.toLowerCase().trim() ?? "";
  const hasLicense = PAID_TIERS.has(tier);
  const hasAccess = useCallback(
    (requiredTier: SubscriptionTier): boolean =>
      TIER_RANK[tier] >= TIER_RANK[requiredTier],
    [tier],
  );

  const refreshLicense = useCallback(async () => {
    const currentRequestId = ++requestId.current;
    if (authLoading) {
      setIsLoading(true);
      return;
    }

    if (isAdmin) {
      setTier("enterprise");
      setIsLoading(false);
      setError(null);
      return;
    }

    if (!userEmail || !session?.access_token) {
      setTier("free");
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const key =
        window.localStorage.getItem("license_key") ??
        window.localStorage.getItem("noorfinance-license-key") ??
        "";
      const query = new URLSearchParams();
      if (key) query.set("licenseKey", key);
      const response = await fetch(`/api/license/verify?${query.toString()}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const result = (await response.json()) as LicenseResponse;
      if (!response.ok || result.error) {
        throw new Error(result.error ?? "Unable to verify subscription.");
      }
      if (currentRequestId !== requestId.current) return;

      const verifiedTier = result.valid ? normalizedTier(result.tier ?? result.plan) : "free";
      setTier(verifiedTier);
      if (verifiedTier === "free") {
        window.localStorage.removeItem("noorfinance_tier");
        window.localStorage.removeItem("noorfinance_plan");
        window.localStorage.removeItem("isPro");
      } else {
        window.localStorage.setItem("noorfinance_tier", verifiedTier);
        window.localStorage.setItem("noorfinance_plan", verifiedTier);
        window.localStorage.setItem("tier", verifiedTier);
        window.localStorage.setItem(
          "isPro",
          String(verifiedTier === "pro" || verifiedTier === "enterprise"),
        );
      }
    } catch (cause) {
      if (currentRequestId !== requestId.current) return;
      setTier("free");
      setError(cause instanceof Error ? cause.message : "Unable to verify subscription.");
    } finally {
      if (currentRequestId === requestId.current) setIsLoading(false);
    }
  }, [authLoading, isAdmin, session?.access_token, userEmail]);

  const consumeFreeCalculation = useCallback((): boolean => {
    if (tier !== "free") return true;
    const used = readFreeCalculationCount();
    if (used >= 1) {
      window.dispatchEvent(new Event("subscription:paywall"));
      return false;
    }
    const next = used + 1;
    window.localStorage.setItem(FREE_CALCULATION_COUNT_KEY, String(next));
    setFreeCalculationsUsed(next);
    return true;
  }, [tier]);

  useEffect(() => {
    void refreshLicense();
    return () => {
      requestId.current += 1;
    };
  }, [refreshLicense]);

  return {
    hasLicense,
    hasAccess,
    isPro: tier === "pro" || tier === "enterprise",
    tier,
    plan: tier,
    freeCalculationsUsed,
    canUseFreeCalculation: freeCalculationsUsed < 1,
    consumeFreeCalculation,
    isLoading,
    error,
    refreshLicense,
    isAdmin,
    userEmail,
  };
}

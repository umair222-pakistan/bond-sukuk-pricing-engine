import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useAdmin } from "./useAdmin";

type LicenseResponse = {
  hasLicense?: boolean;
  error?: string;
};

export function useLicense() {
  const [hasLicense, setHasLicense] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const { session, user, loading: authLoading } = useAuth();
  const { isAdmin } = useAdmin();
  const userEmail = user?.email?.toLowerCase().trim() ?? "";

  const refreshLicense = useCallback(async () => {
    const currentRequestId = ++requestId.current;
    if (authLoading) {
      setIsLoading(true);
      return;
    }

    if (isAdmin) {
      setHasLicense(true);
      setIsLoading(false);
      setError(null);
      return;
    }

    if (!userEmail || !session?.access_token) {
      setHasLicense(false);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/license/verify", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const result = await response.json() as LicenseResponse;
      if (!response.ok) {
        throw new Error(result.error ?? "Unable to verify license.");
      }
      if (currentRequestId !== requestId.current) return;
      setHasLicense(result.hasLicense === true);
    } catch (cause) {
      if (currentRequestId !== requestId.current) return;
      setHasLicense(false);
      setError(cause instanceof Error ? cause.message : "Unable to verify license.");
    } finally {
      if (currentRequestId === requestId.current) {
        setIsLoading(false);
      }
    }
  }, [authLoading, isAdmin, session?.access_token, userEmail]);

  useEffect(() => {
    void refreshLicense();
    return () => {
      requestId.current += 1;
    };
  }, [refreshLicense]);

  return { hasLicense, isLoading, error, refreshLicense, isAdmin, userEmail };
}
